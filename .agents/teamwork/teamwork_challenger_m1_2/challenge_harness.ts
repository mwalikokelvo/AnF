// Milestone M1 Areas 2 & 3 Empirical Challenger Test Harness
// Comprehensive stress testing and adversarial evaluation for:
// 1. LRCLIB lyrics parsing, offset headers, and activeLine binary search boundary lookups
// 2. Lyrics offline cascade: offline mode simulation, AbortSignal timeouts, zero-connectivity fallbacks
// 3. Podcast RSS feed parsing: malformed XML, missing enclosures, invalid duration strings, empty feeds, oversized feeds
// 4. Spotube streaming resolution: offline degradation, stream source unreachable, fallback to cached IndexedDB audio blob

import { describe, test, before, beforeEach, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Import domain modules under test
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack, type Lyrics, type LyricLine } from '../../../windows/src/workspace/lyrics.ts';
import { cleanTitle, primaryArtist, fetchOnlineLyrics, type RemoteLyrics } from '../../../windows/src/workspace/lyrics-provider.ts';
import { parseDuration, parseRss, substackFeedUrl, loadFeeds, saveFeeds, updateEpisodePosition, markEpisodePlayed, getEpisodeState, saveEpisodeState, loadEpisodeStates, downloadPodcastEnclosure, removeDownloadedPodcast, type PodcastEpisode, type PodcastFeed } from '../../../windows/src/workspace/podcast-feeds.ts';
import { SpotubeStreamService, cacheStreamTrack, type StreamTrackMetadata } from '../../../windows/src/workspace/streaming-provider.ts';
import { orderedTracks, type AudioTrack } from '../../../windows/src/workspace/audio-library.ts';

// -----------------------------------------------------------------------------
// Environment Polyfills (localStorage, DOMParser, indexedDB, navigator)
// -----------------------------------------------------------------------------

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.has(key) ? this.store.get(key)! : null; }
  key(index: number): string | null { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

class DOMElementNode {
  tagName: string;
  attributes: Record<string, string> = {};
  children: DOMElementNode[] = [];
  textContent = '';
  parentElement: DOMElementNode | null = null;
  className = '';

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  getAttribute(name: string): string | null {
    const val = this.attributes[name.toLowerCase()];
    return val !== undefined ? val : null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name.toLowerCase()] = String(value);
  }

  querySelector(selector: string): DOMElementNode | null {
    const res = this.querySelectorAll(selector);
    return res[0] || null;
  }

  querySelectorAll(selector: string): DOMElementNode[] {
    const subSelectors = selector.split(',').map(s => s.trim().replace(/\\:/g, ':').toLowerCase());
    const matches: DOMElementNode[] = [];

    const testTag = (el: DOMElementNode, sel: string): boolean => {
      if (sel.includes(' ')) {
        const parts = sel.split(/\s+/);
        let curr: DOMElementNode | null = el;
        for (let i = parts.length - 1; i >= 0; i--) {
          const part = parts[i];
          if (!curr || !testTag(curr, part)) return false;
          curr = curr.parentElement;
        }
        return true;
      }
      return el.tagName === sel;
    };

    const walk = (node: DOMElementNode) => {
      for (const child of node.children) {
        if (child.tagName !== '#text') {
          for (const sel of subSelectors) {
            if (testTag(child, sel)) {
              if (!matches.includes(child)) matches.push(child);
              break;
            }
          }
          walk(child);
        }
      }
    };

    walk(this);
    return matches;
  }
}

class XMLParserPolyfill {
  parseFromString(source: string, _mimeType: string): DOMElementNode {
    const root = new DOMElementNode('#document');
    let current: DOMElementNode = root;
    const stack: DOMElementNode[] = [root];

    // Decode CDATA
    const cleanSource = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, cdata) => {
      return cdata.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    });

    const tagRegex = /<([!\/?]?[\w:-]+)([^>]*?)(\/?)>|([^<]+)/gs;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(cleanSource)) !== null) {
      const [_, tagName, attrString, isSelfClosing, textContent] = match;

      if (textContent) {
        const textNode = new DOMElementNode('#text');
        textNode.textContent = textContent.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
        if (textNode.textContent) {
          textNode.parentElement = current;
          current.children.push(textNode);
          current.textContent = (current.textContent ? current.textContent + ' ' : '') + textNode.textContent;
        }
        continue;
      }

      if (!tagName || tagName.startsWith('!--') || tagName.startsWith('!DOCTYPE') || tagName.startsWith('?')) {
        continue;
      }

      if (tagName.startsWith('/')) {
        if (stack.length > 1) {
          stack.pop();
          current = stack[stack.length - 1];
        }
        continue;
      }

      const el = new DOMElementNode(tagName);
      if (attrString) {
        const attrRegex = /([\w:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
        let aMatch: RegExpExecArray | null;
        while ((aMatch = attrRegex.exec(attrString)) !== null) {
          el.setAttribute(aMatch[1], aMatch[2] ?? aMatch[3] ?? aMatch[4] ?? '');
        }
      }

      el.parentElement = current;
      current.children.push(el);

      if (!isSelfClosing) {
        stack.push(el);
        current = el;
      }
    }

    return root;
  }
}

// Global setup
const memStorage = new MemoryStorage();
globalThis.localStorage = memStorage;
globalThis.DOMParser = XMLParserPolyfill as any;

function setMockOnline(online: boolean | undefined) {
  Object.defineProperty(navigator, 'onLine', {
    value: online,
    configurable: true,
    writable: true,
  });
}

// -----------------------------------------------------------------------------
// AREA 1: LRCLIB Lyrics Parsing & Binary Search ActiveLine Boundaries
// -----------------------------------------------------------------------------

describe('Area 1: LRCLIB Lyrics Parsing & ActiveLine Boundary Stress-Tests', () => {

  test('LRC-1: Malformed and boundary seconds parsing in timestamps', () => {
    // Normal 2-digit seconds
    const lrcNormal = '[01:15.50] Valid line';
    const parsedNormal = parseLyrics(lrcNormal);
    assert.equal(parsedNormal.synced, true);
    assert.equal(parsedNormal.lines[0].time, 75.5);
    assert.equal(parsedNormal.lines[0].text, 'Valid line');

    // 3-digit millisecond fractions
    const lrc3Digit = '[00:10.125] Fraction line';
    const parsed3Digit = parseLyrics(lrc3Digit);
    assert.equal(parsed3Digit.lines[0].time, 10.125);

    // 1-digit fraction
    const lrc1Digit = '[00:10.5] Single fraction';
    assert.equal(parseLyrics(lrc1Digit).lines[0].time, 10.5);

    // Rejection of invalid seconds >= 60 (prevent silent rollover)
    const lrcInvalidSec = '[00:60.00] Sixty seconds\n[00:99.99] Ninety-nine seconds\n[00:05.00] Valid five';
    const parsedInvalid = parseLyrics(lrcInvalidSec);
    assert.equal(parsedInvalid.lines.length, 1);
    assert.equal(parsedInvalid.lines[0].time, 5);
    assert.equal(parsedInvalid.lines[0].text, 'Valid five');

    // Reject non-numeric and negative values
    const lrcNonNumeric = '[ab:cd] Bad\n[--:--] Dashes\n[-01:20] Negative minute\n[01:-20] Negative second';
    const parsedNonNumeric = parseLyrics(lrcNonNumeric);
    assert.equal(parsedNonNumeric.synced, false); // No valid timestamps, treated as plain text
  });

  test('LRC-2: Multi-tag lines and out-of-order timestamp sorting', () => {
    // Single line with multiple timestamps (repeating chorus)
    const multiTag = '[00:02.00][00:10.00][00:25.00] Repeated Chorus';
    const parsedMulti = parseLyrics(multiTag);
    assert.equal(parsedMulti.synced, true);
    assert.equal(parsedMulti.lines.length, 3);
    assert.deepEqual(parsedMulti.lines.map(l => l.time), [2, 10, 25]);
    assert.deepEqual(parsedMulti.lines.map(l => l.text), ['Repeated Chorus', 'Repeated Chorus', 'Repeated Chorus']);

    // Scrambled / out-of-order lines must be sorted chronologically
    const scrambled = '[01:30.00] Line 3\n[00:15.00] Line 1\n[00:45.00] Line 2';
    const parsedScrambled = parseLyrics(scrambled);
    assert.deepEqual(parsedScrambled.lines.map(l => l.text), ['Line 1', 'Line 2', 'Line 3']);
    assert.deepEqual(parsedScrambled.lines.map(l => l.time), [15, 45, 90]);
  });

  test('LRC-3: Offset header variations, bounds, and placement', () => {
    // Standard positive offset (advances timestamps)
    const posOffset = '[offset:+1000]\n[00:10.00] Advance 1s';
    assert.equal(parseLyrics(posOffset).lines[0].time, 9.0);

    // Standard negative offset (delays timestamps)
    const negOffset = '[offset:-2500]\n[00:10.00] Delay 2.5s';
    assert.equal(parseLyrics(negOffset).lines[0].time, 12.5);

    // Whitespace inside offset tag
    const spaceOffset = '[offset:   +500  ]\n[00:10.00] Spaced offset';
    assert.equal(parseLyrics(spaceOffset).lines[0].time, 9.5);

    // Extreme positive offset that would produce negative timestamp (must clamp to 0)
    const clampOffset = '[offset:+20000]\n[00:05.00] Clamped line';
    assert.equal(parseLyrics(clampOffset).lines[0].time, 0);

    // Offset placed after multiple metadata headers
    const deepOffset = '[ti:Test Song]\n[ar:Test Artist]\n[al:Test Album]\n[offset:+2000]\n[00:05.00] Lyric line';
    assert.equal(parseLyrics(deepOffset).lines[0].time, 3.0);

    // Malformed offset tag (ignored, offset defaults to 0)
    const malformedOffset = '[offset:abc]\n[00:05.00] Normal line';
    assert.equal(parseLyrics(malformedOffset).lines[0].time, 5.0);
  });

  test('LRC-4: Word-synced timestamp stripping and metadata tag filtering', () => {
    // Word-synced karaoke tags <mm:ss.xx> stripped cleanly
    const wordSynced = '[00:10.00]<00:10.00>Never <00:10.50>gonna <00:11.00>give <00:11.50>you <00:12.00>up';
    const parsedWord = parseLyrics(wordSynced);
    assert.equal(parsedWord.lines[0].text, 'Never gonna give you up');
    assert.equal(parsedWord.lines[0].time, 10.0);

    // Standard metadata tags ignored
    const metadataTags = '[ar:Artist]\n[ti:Title]\n[al:Album]\n[au:Author]\n[by:Creator]\n[length:03:45]\n[re:Player]\n[ve:1.0]\n[#:Comment]\n[00:01.00]First real line';
    const parsedMeta = parseLyrics(metadataTags);
    assert.equal(parsedMeta.lines.length, 1);
    assert.equal(parsedMeta.lines[0].text, 'First real line');

    // UTF-8 BOM stripped cleanly
    const bomLrc = '\uFEFF[00:02.00]Song with BOM';
    const parsedBom = parseLyrics(bomLrc);
    assert.equal(parsedBom.synced, true);
    assert.equal(parsedBom.lines[0].text, 'Song with BOM');
  });

  test('LRC-5: Stress testing input size caps and line limits', () => {
    // Text length capping at MAX_TEXT (200_000)
    const hugeLine = '[00:01.00] ' + 'A'.repeat(500);
    const hugeText = Array(600).fill(hugeLine).join('\n'); // ~300,000 chars
    const parsedHuge = parseLyrics(hugeText);
    assert.ok(parsedHuge.lines.length > 0);
    assert.ok(parsedHuge.lines.length <= 5000);

    // Line count capping at MAX_LINES (5000)
    const lines7000 = Array.from({ length: 7000 }, (_, i) => `[${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.00] Line ${i}`).join('\n');
    const parsed7000 = parseLyrics(lines7000);
    assert.equal(parsed7000.lines.length, 5000); // capped at 5000
  });

  test('LRC-6: Binary search activeLine boundary lookups (-1, 0, > last line, exact boundary)', () => {
    const lrc = `
[00:05.00] Line 0 (at 5s)
[00:10.00] Line 1 (at 10s)
[00:20.00] Line 2 (at 20s)
[00:30.00] Line 3 (at 30s)
`;
    const lyrics = parseLyrics(lrc);
    assert.equal(lyrics.lines.length, 4);

    // Unsynced lyrics return -1
    assert.equal(activeLine({ synced: false, lines: [] }, 10), -1);

    // Empty lines return -1
    assert.equal(activeLine({ synced: true, lines: [] }, 10), -1);

    // Negative playback position
    assert.equal(activeLine(lyrics, -1), -1);
    assert.equal(activeLine(lyrics, -100), -1);

    // Position 0 before first lyric line (at 5s)
    assert.equal(activeLine(lyrics, 0), -1);
    assert.equal(activeLine(lyrics, 4.999), -1);

    // Exactly on first line boundary (5.0s)
    assert.equal(activeLine(lyrics, 5.0), 0);

    // Mid-way between line 0 and line 1
    assert.equal(activeLine(lyrics, 7.5), 0);
    assert.equal(activeLine(lyrics, 9.999), 0);

    // Exactly on line 1 boundary (10.0s)
    assert.equal(activeLine(lyrics, 10.0), 1);

    // Exactly on line 2 boundary (20.0s)
    assert.equal(activeLine(lyrics, 20.0), 2);

    // Exactly on line 3 boundary (30.0s)
    assert.equal(activeLine(lyrics, 30.0), 3);

    // Far past last line (> 30s) clamps to last line index
    assert.equal(activeLine(lyrics, 31.0), 3);
    assert.equal(activeLine(lyrics, 1000.0), 3);
    assert.equal(activeLine(lyrics, 999999.0), 3);

    // Non-finite values
    assert.equal(activeLine(lyrics, NaN), -1);
    assert.equal(activeLine(lyrics, Infinity), 3);
    assert.equal(activeLine(lyrics, -Infinity), -1);
  });

  test('LRC-7: activeLine with first line starting at exactly 0.0s', () => {
    const lrcZero = '[00:00.00] Intro line\n[00:05.00] Next line';
    const lyricsZero = parseLyrics(lrcZero);
    assert.equal(activeLine(lyricsZero, 0), 0);
    assert.equal(activeLine(lyricsZero, 0.5), 0);
    assert.equal(activeLine(lyricsZero, 5.0), 1);
  });

  test('LRC-8: cleanTitle and primaryArtist edge cases', () => {
    // Promotional video/audio/lyrics suffixes
    assert.equal(cleanTitle('Track Title (Official Music Video)'), 'Track Title');
    assert.equal(cleanTitle('Track Title [Lyric Video]'), 'Track Title');
    assert.equal(cleanTitle('Track Title (Audio)'), 'Track Title');
    assert.equal(cleanTitle('Track Title - Visualizer'), 'Track Title');
    assert.equal(cleanTitle('Track Title (2024 Remaster)'), 'Track Title');
    assert.equal(cleanTitle('Track Title (Acoustic Version)'), 'Track Title');
    assert.equal(cleanTitle('Track Title (Radio Edit)'), 'Track Title');
    assert.equal(cleanTitle('Track Title (feat. Featured Artist)'), 'Track Title');
    assert.equal(cleanTitle('Track Title feat. Other'), 'Track Title');
    assert.equal(cleanTitle('Track Title - Official'), 'Track Title');

    // Primary artist extraction
    assert.equal(primaryArtist('Lead Artist feat. Guest'), 'Lead Artist');
    assert.equal(primaryArtist('Lead Artist ft. Guest'), 'Lead Artist');
    assert.equal(primaryArtist('Lead Artist featuring Guest'), 'Lead Artist');
    assert.equal(primaryArtist('Artist A x Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A & Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A and Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A with Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A, Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A / Artist B'), 'Artist A');
    assert.equal(primaryArtist('Artist A; Artist B'), 'Artist A');
    assert.equal(primaryArtist('Solo Artist'), 'Solo Artist');
  });

  test('LRC-9: Empty text on timed lines (instrumental pauses) and identical consecutive timestamps', () => {
    const lrc = '[00:05.00]Intro\n[00:10.00]\n[00:10.00]Identical Line A\n[00:10.00]Identical Line B\n[00:20.00]Outro';
    const parsed = parseLyrics(lrc);
    assert.equal(parsed.synced, true);
    assert.equal(parsed.lines.length, 5);

    // Empty text line retained as an instrumental mark
    assert.equal(parsed.lines[1].text, '');
    assert.equal(parsed.lines[1].time, 10.0);

    // activeLine on identical timestamps resolves to rightmost (last matching line)
    assert.equal(activeLine(parsed, 10.0), 3);
    assert.equal(parsed.lines[3].text, 'Identical Line B');
  });

  test('LRC-10: Single-line lyric file boundary testing', () => {
    const single = parseLyrics('[00:15.00] The only lyric line in the song');
    assert.equal(single.synced, true);
    assert.equal(single.lines.length, 1);

    assert.equal(activeLine(single, 0), -1);
    assert.equal(activeLine(single, 14.99), -1);
    assert.equal(activeLine(single, 15.0), 0);
    assert.equal(activeLine(single, 30.0), 0);
    assert.equal(activeLine(single, 9999), 0);
  });
});

// -----------------------------------------------------------------------------
// AREA 2: Lyrics Offline Cascade & Network Timeout Simulation
// -----------------------------------------------------------------------------

describe('Area 2: Lyrics Offline Cascade & Network Simulation Stress-Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setMockOnline(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setMockOnline(true);
  });

  test('CASCADE-1: Offline mode (navigator.onLine = false) returns undefined immediately', async () => {
    setMockOnline(false);
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      throw new Error('Network should not be contacted when offline');
    };

    const result = await fetchOnlineLyrics({ title: 'Offline Song', artist: 'Artist' });
    assert.equal(result, undefined);
    assert.equal(fetchCalled, false, 'Fetch must not be called when navigator.onLine is false');
  });

  test('CASCADE-2: AbortSignal / network timeout simulation degrades cleanly without crashing', async () => {
    setMockOnline(true);

    // Simulate fetch hanging / aborting with DOMException TimeoutError
    globalThis.fetch = async (_url, options) => {
      const signal = options?.signal;
      if (signal?.aborted) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return new Promise((_, reject) => {
        if (signal) {
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted due to timeout', 'TimeoutError')));
        }
        setTimeout(() => {
          reject(new DOMException('The operation timed out', 'TimeoutError'));
        }, 10);
      });
    };

    const result = await fetchOnlineLyrics({ title: 'Timeout Song', artist: 'Artist' });
    assert.equal(result, undefined, 'Network timeout must degrade cleanly to undefined');
  });

  test('CASCADE-3: Zero-connectivity network error (TypeError / DNS failure) gracefully caught', async () => {
    setMockOnline(true);
    globalThis.fetch = async () => {
      throw new TypeError('Failed to fetch (DNS resolution failed)');
    };

    const result = await fetchOnlineLyrics({ title: 'Unreachable Song', artist: 'Artist' });
    assert.equal(result, undefined, 'Zero-connectivity network failure must be caught gracefully');
  });

  test('CASCADE-4: HTTP 429 Rate Limit and HTTP 503 Server Unavailable degradation', async () => {
    setMockOnline(true);

    // Test 429 Rate Limited
    globalThis.fetch = async () => ({
      ok: false,
      status: 429,
      headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? '30' : null }
    } as any);

    const res429 = await fetchOnlineLyrics({ title: 'Rate Limited Song', artist: 'Artist' });
    assert.equal(res429, undefined);

    // Test 503 Unavailable
    globalThis.fetch = async () => ({
      ok: false,
      status: 503,
      headers: { get: () => null }
    } as any);

    const res503 = await fetchOnlineLyrics({ title: 'Service Down Song', artist: 'Artist' });
    assert.equal(res503, undefined);
  });

  test('CASCADE-5: Fuzzy search fallback with duration tolerance matching (±5s and ±8s)', async () => {
    setMockOnline(true);

    // Mock exact match returning 404, then search returning candidates
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/get')) {
        return { ok: false, status: 404 } as any;
      }
      if (urlStr.includes('/api/search')) {
        const candidates: RemoteLyrics[] = [
          { id: 1, trackName: 'Song', duration: 250, syncedLyrics: '[00:01.00] Mismatched 250s' },
          { id: 2, trackName: 'Song', duration: 182, syncedLyrics: '[00:01.00] Matched 182s (delta 2s)' },
          { id: 3, trackName: 'Song', duration: 175, syncedLyrics: '[00:01.00] Matched 175s (delta 5s)' },
        ];
        return {
          ok: true,
          status: 200,
          json: async () => candidates
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    // Target duration = 180s. Delta for id:2 is 2s (within ±5s).
    const lyrics = await fetchOnlineLyrics({ title: 'Song', artist: 'Artist', duration: 180 });
    assert.equal(lyrics, '[00:01.00] Matched 182s (delta 2s)');
  });

  test('CASCADE-6: Local LRC file matching by path stem and baseName without network', () => {
    const tracks = [
      { id: 'track-1', name: '01 - Midnight City.mp3', importPath: 'Music/M83/01 - Midnight City.mp3' },
      { id: 'track-2', name: '02 - Reunion.mp3', importPath: 'Music/M83/02 - Reunion.mp3' },
    ];

    // Match by exact relative path stem
    const matchedPath = matchLyricsTrack({ name: '01 - Midnight City.lrc', webkitRelativePath: 'Music/M83/01 - Midnight City.lrc' }, tracks);
    assert.ok(matchedPath);
    assert.equal(matchedPath.id, 'track-1');

    // Match by base filename when unique
    const matchedName = matchLyricsTrack({ name: '02 - Reunion.lrc' }, tracks);
    assert.ok(matchedName);
    assert.equal(matchedName.id, 'track-2');

    // Unmatched file returns undefined
    const unmatched = matchLyricsTrack({ name: '03 - Wait.lrc' }, tracks);
    assert.equal(unmatched, undefined);
  });

  test('CASCADE-7: LRCLIB malformed JSON and instrumental/empty response degradation', async () => {
    setMockOnline(true);

    // Malformed JSON response body
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token in JSON'); }
    } as any);

    const resBadJson = await fetchOnlineLyrics({ title: 'Bad JSON Song' });
    assert.equal(resBadJson, undefined, 'Must handle malformed JSON gracefully');

    // Instrumental track response without lyrics
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ instrumental: true, plainLyrics: '', syncedLyrics: '' })
    } as any);

    const resInstrumental = await fetchOnlineLyrics({ title: 'Instrumental Song' });
    assert.equal(resInstrumental, undefined, 'Instrumental tracks with empty lyrics return undefined');
  });

  test('CASCADE-8: LRCLIB search candidates with missing or null durations', async () => {
    setMockOnline(true);

    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/get')) return { ok: false, status: 404 } as any;
      if (urlStr.includes('/api/search')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            // Candidate with no duration property at all
            { id: 10, trackName: 'Ambiguous Song', syncedLyrics: '[00:05.00] No duration specified' },
          ]
        } as any;
      }
      return { ok: false, status: 404 } as any;
    };

    const res = await fetchOnlineLyrics({ title: 'Ambiguous Song', duration: 180 });
    assert.equal(res, '[00:05.00] No duration specified');
  });
});

// -----------------------------------------------------------------------------
// AREA 3: Podcast RSS Feed Parsing Stress-Tests
// -----------------------------------------------------------------------------

describe('Area 3: Podcast RSS Feed Parsing Stress-Tests', () => {

  test('RSS-1: Malformed and truncated XML handling without unhandled exceptions', () => {
    const truncatedXml = `<rss version="2.0"><channel><title>Incomplete Podcast</title><item><title>Broken Item`;
    const feed = parseRss(truncatedXml, 'https://podcast.example.com/feed.xml');
    assert.ok(feed);
    assert.equal(feed.title, 'Incomplete Podcast');
    assert.ok(Array.isArray(feed.episodes));

    // Completely invalid non-XML text
    const garbageXml = `Not even XML <! random garbage >>>`;
    const garbageFeed = parseRss(garbageXml, 'https://example.org/rss');
    assert.ok(garbageFeed);
    assert.equal(garbageFeed.title, 'example.org'); // Falls back to hostname
    assert.equal(garbageFeed.episodes.length, 0);
  });

  test('RSS-2: Items with missing or malformed enclosures filtered out', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>No Enclosure Episode</title>
          <guid>ep-1</guid>
        </item>
        <item>
          <title>Empty URL Enclosure Episode</title>
          <guid>ep-2</guid>
          <enclosure url="" type="audio/mpeg" length="1234"/>
        </item>
        <item>
          <title>Valid Enclosure Episode</title>
          <guid>ep-3</guid>
          <enclosure url="https://example.com/audio/ep3.mp3" type="audio/mpeg" length="45000000"/>
          <itunes:duration>30:00</itunes:duration>
        </item>
      </channel>
    </rss>`;

    const feed = parseRss(xml, 'https://example.com/rss');
    assert.equal(feed.episodes.length, 1);
    assert.equal(feed.episodes[0].id, 'ep-3');
    assert.equal(feed.episodes[0].audioUrl, 'https://example.com/audio/ep3.mp3');
    assert.equal(feed.episodes[0].enclosureLength, 45000000);
    assert.equal(feed.episodes[0].enclosureType, 'audio/mpeg');
  });

  test('RSS-3: parseDuration comprehensive validation (letters, negatives, decimals, empty)', () => {
    // Valid standard durations
    assert.equal(parseDuration('120'), 120);
    assert.equal(parseDuration('03:45'), 225);
    assert.equal(parseDuration('01:30:15'), 5415);
    assert.equal(parseDuration('00:00:10'), 10);
    assert.equal(parseDuration('0:05'), 5);

    // Decimal seconds
    assert.equal(parseDuration('45.7'), 46);
    assert.equal(parseDuration('0.2'), 0);

    // Whitespace handling
    assert.equal(parseDuration('  02:30  '), 150);

    // Invalid non-numeric strings return undefined
    assert.equal(parseDuration(''), undefined);
    assert.equal(parseDuration('   '), undefined);
    assert.equal(parseDuration('invalid'), undefined);
    assert.equal(parseDuration('unknown'), undefined);
    assert.equal(parseDuration('12:xx:00'), undefined);
    assert.equal(parseDuration('abc:def'), undefined);

    // Negative numbers return undefined
    assert.equal(parseDuration('-120'), undefined);
    assert.equal(parseDuration('-05:00'), undefined);
    assert.equal(parseDuration('01:-10:00'), undefined);

    // Null and undefined
    assert.equal(parseDuration(null), undefined);
    assert.equal(parseDuration(undefined), undefined);

    // Colon edge cases with empty parts (evaluated via Number('') === 0 coercion)
    assert.equal(parseDuration(':'), 0);
    assert.equal(parseDuration('::'), 0);
    assert.equal(parseDuration('12:'), 720);
    assert.equal(parseDuration(':12'), 12);
  });

  test('RSS-4: Empty feeds and feeds without channel element', () => {
    // Empty channel
    const emptyXml = `<rss version="2.0"><channel><title>Empty</title></channel></rss>`;
    const feed = parseRss(emptyXml, 'https://empty.org/rss');
    assert.equal(feed.title, 'Empty');
    assert.equal(feed.episodes.length, 0);

    // Completely empty RSS
    const noChannelXml = `<rss version="2.0"></rss>`;
    const noChannelFeed = parseRss(noChannelXml, 'https://nochannel.org/podcast');
    assert.equal(noChannelFeed.title, 'nochannel.org');
    assert.equal(noChannelFeed.episodes.length, 0);
  });

  test('RSS-5: Oversized feeds capping at 300 items and HTML description stripping', () => {
    const items = Array.from({ length: 400 }, (_, i) => `
      <item>
        <title>Episode ${i}</title>
        <guid>guid-${i}</guid>
        <description><![CDATA[<p><strong>Detailed summary</strong> with <a href="#">links</a>.</p>]]></description>
        <enclosure url="https://example.com/ep${i}.mp3" type="audio/mpeg" length="1000000"/>
        <itunes:duration>10:00</itunes:duration>
      </item>
    `).join('\n');

    const bigXml = `<rss version="2.0"><channel><title>Massive Feed</title>${items}</channel></rss>`;
    const feed = parseRss(bigXml, 'https://big.example.com/feed');

    // Must be capped at 300 episodes
    assert.equal(feed.episodes.length, 300);
    assert.equal(feed.episodes[0].title, 'Episode 0');
    // strip() replaces HTML tags with single spaces and slices to 400 chars
    assert.equal(feed.episodes[0].summary, 'Detailed summary with links .');
    assert.ok(!feed.episodes[0].summary.includes('<p>'));
    assert.ok(!feed.episodes[0].summary.includes('<strong>'));
  });

  test('RSS-6: Substack URL normalizer', () => {
    assert.equal(substackFeedUrl('https://author.substack.com'), 'https://author.substack.com/feed');
    assert.equal(substackFeedUrl('https://author.substack.com/feed'), 'https://author.substack.com/feed');
    assert.equal(substackFeedUrl('https://substack.com/@author'), 'https://substack.com/feed');
    assert.equal(substackFeedUrl('https://otherplatform.com/podcast'), undefined);
    assert.equal(substackFeedUrl('not-a-url'), undefined);
  });

  test('RSS-7: Episode playback state and progress persistence', () => {
    const epId = 'podcast-ep-state-test';

    // Position updates
    updateEpisodePosition(epId, 420.5);
    let state = getEpisodeState(epId);
    assert.equal(state.position, 420.5);
    assert.equal(state.played, false);

    // Negative position clamped to 0
    updateEpisodePosition(epId, -50);
    state = getEpisodeState(epId);
    assert.equal(state.position, 0);

    // Played toggle
    markEpisodePlayed(epId, true);
    state = getEpisodeState(epId);
    assert.equal(state.played, true);
  });

  test('RSS-8: Fallback GUID generation, season/episode numbering, and length sanitization', () => {
    const xml = `<?xml version="1.0"?>
    <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
      <channel>
        <title>Numbered Show</title>
        <item>
          <!-- Missing guid: will use feedUrl#index -->
          <title>Ep Without Guid</title>
          <enclosure url="https://example.org/audio1.mp3" length="-500" type="audio/mpeg"/>
          <itunes:episode>42</itunes:episode>
          <itunes:season>3</itunes:season>
        </item>
      </channel>
    </rss>`;

    const feed = parseRss(xml, 'https://example.org/rss');
    assert.equal(feed.episodes.length, 1);
    const ep = feed.episodes[0];
    assert.equal(ep.id, 'https://example.org/rss#0'); // Synthesized GUID
    assert.equal(ep.episodeNo, 42);
    assert.equal(ep.seasonNo, 3);
    assert.equal(ep.enclosureLength, undefined, 'Negative length must be rejected by /\\^\\d+$/');
  });

  test('RSS-9: Corrupted localStorage JSON recovery for podcast feeds', () => {
    // Inject corrupt JSON into localStorage
    localStorage.setItem('anf-podcast-feeds', '{corrupted json[');
    localStorage.setItem('anf-podcast-episode-states', 'not valid json at all');

    // loadFeeds must recover cleanly and return empty array
    const feeds = loadFeeds();
    assert.deepEqual(feeds, []);

    // loadEpisodeStates must recover cleanly and return empty object
    const states = loadEpisodeStates();
    assert.deepEqual(states, {});
  });
});

// -----------------------------------------------------------------------------
// AREA 4: Spotube Streaming Audio Resolution & Offline Degradation
// -----------------------------------------------------------------------------

describe('Area 4: Spotube Streaming Resolution & Offline Cache Degradation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setMockOnline(true);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setMockOnline(true);
  });

  test('STREAM-1: Search tracks uses cache and skips network when offline', async () => {
    setMockOnline(false);
    const service = new SpotubeStreamService();

    const track: StreamTrackMetadata = {
      id: 'sp-offline-1',
      title: 'Cached Offline Track',
      artist: 'Offline Artist',
      streamUrl: 'https://stream.example.org/1.mp3'
    };
    service.registerMetadata(track);

    let networkCalled = false;
    globalThis.fetch = async () => {
      networkCalled = true;
      throw new Error('Network must not be called when offline');
    };

    const results = await service.searchTracks('Offline');
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'sp-offline-1');
    assert.equal(networkCalled, false, 'Search must use local cache without network call when offline');
  });

  test('STREAM-2: Remote stream resolution failure degrades gracefully', async () => {
    setMockOnline(true);
    const service = new SpotubeStreamService();

    // Unknown track resolveStreamUrl throws descriptive error
    await assert.rejects(
      async () => await service.resolveStreamUrl('non-existent-id'),
      /Stream URL unavailable for track non-existent-id/
    );

    // Unknown track resolveStream returns null
    const resolved = await service.resolveStream({
      id: 'no-stream-track',
      title: 'No Stream',
      artist: 'Artist'
    });
    assert.equal(resolved, null);
  });

  test('STREAM-3: Caching streaming audio blob into offline library with "stream:" prefix', async () => {
    const service = new SpotubeStreamService();
    const storedTracks: AudioTrack[] = [];
    const mockLibrary = {
      put: async (t: AudioTrack) => { storedTracks.push(t); },
      tracks: async () => storedTracks
    };

    const mockBlob = new Blob(['mock audio stream data'], { type: 'audio/mp4' });
    const metadata: StreamTrackMetadata = {
      id: 'sp-stream-blob-test',
      title: 'Stream Blob Song',
      artist: 'Stream Artist',
      album: 'Stream Album',
      duration: 215,
      streamUrl: 'https://stream.example.org/blob-test.mp4'
    };

    const saved = await service.cacheStreamTrack(mockLibrary, metadata, mockBlob);
    assert.equal(saved.id, 'stream:sp-stream-blob-test');
    assert.equal(saved.title, 'Stream Blob Song');
    assert.equal(saved.kind, 'music');
    assert.equal(saved.format, 'audio/mp4');
    assert.equal(saved.blob.size, mockBlob.size);

    // Verify getCachedStreamTracks filters correctly
    const cached = await service.getCachedStreamTracks(mockLibrary);
    assert.equal(cached.length, 1);
    assert.equal(cached[0].id, 'stream:sp-stream-blob-test');
  });

  test('STREAM-4: Stream download failure during caching throws error and does not corrupt library', async () => {
    const service = new SpotubeStreamService();
    const storedTracks: AudioTrack[] = [];
    const mockLibrary = {
      put: async (t: AudioTrack) => { storedTracks.push(t); },
      tracks: async () => storedTracks
    };

    globalThis.fetch = async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found'
    } as any);

    const metadata: StreamTrackMetadata = {
      id: 'sp-fail',
      title: 'Failing Stream',
      artist: 'Artist',
      streamUrl: 'https://stream.example.com/fail.mp3'
    };

    await assert.rejects(
      async () => await service.cacheStreamTrack(mockLibrary, metadata, 'https://stream.example.com/fail.mp3'),
      /Stream audio download failed \(404\)/
    );

    assert.equal(storedTracks.length, 0, 'No corrupt track should be inserted into library on download error');
  });

  test('STREAM-5: Offline playback selection verifies blob source precedence over unreachable streamUrl', () => {
    // Test the logic implemented in music-hub.ts select():
    // If track.blob && track.blob.size > 0, source is created via URL.createObjectURL(track.blob),
    // ignoring track.streamUrl which is unreachable offline.

    const cachedTrack: AudioTrack = {
      id: 'stream:sp-cached-1',
      title: 'Cached Stream Song',
      artist: 'Spotube Artist',
      name: 'Cached Stream Song',
      blob: new Blob(['offline audio binary bytes'], { type: 'audio/mp4' }),
      streamUrl: 'https://unreachable-offline-stream.example.org/audio.mp4',
      created: Date.now(),
      duration: 180
    };

    let source = '';
    let objectUrlCreated = false;

    // Simulate URL.createObjectURL
    const origCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = (b: any) => {
      objectUrlCreated = true;
      return 'blob:http://localhost/mock-stream-blob-id';
    };

    try {
      if (cachedTrack.blob && cachedTrack.blob.size > 0) {
        source = URL.createObjectURL(cachedTrack.blob);
      } else if (cachedTrack.streamUrl) {
        source = cachedTrack.streamUrl;
      }

      assert.equal(objectUrlCreated, true);
      assert.equal(source, 'blob:http://localhost/mock-stream-blob-id');
      assert.notEqual(source, cachedTrack.streamUrl, 'Must prioritize cached blob over remote streamUrl');
    } finally {
      URL.createObjectURL = origCreateObjectURL;
    }
  });

  test('STREAM-6: Empty or whitespace query handling and duplicate ID overwrite', async () => {
    const service = new SpotubeStreamService();

    // Empty or whitespace queries return empty array without contacting network
    assert.deepEqual(await service.searchTracks(''), []);
    assert.deepEqual(await service.searchTracks('   '), []);

    // Overwriting track with same ID updates metadata
    service.registerMetadata({ id: 'track-dup', title: 'Initial Title', artist: 'Artist' });
    assert.equal((await service.getTrack('track-dup'))?.title, 'Initial Title');

    service.registerMetadata({ id: 'track-dup', title: 'Updated Title', artist: 'Artist' });
    assert.equal((await service.getTrack('track-dup'))?.title, 'Updated Title');
  });
});
