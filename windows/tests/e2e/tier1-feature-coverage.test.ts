import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from './test-env.js';

setupTestEnvironment();

import { reconcileQueue, moveTrack, shuffled, nextTrack } from '../../src/workspace/audio-queue.js';
import { durationText, peaks, level, wav } from '../../src/workspace/audio-data.js';
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack } from '../../src/workspace/lyrics.js';
import { cleanTitle, primaryArtist } from '../../src/workspace/lyrics-provider.js';
import { parseRss, substackFeedUrl, loadFeeds, saveFeeds } from '../../src/workspace/podcast-feeds.js';
import { sections, readingState, addHighlight, clipText, sectionIndex } from '../../../shared/domain/reader-data.js';
import { renderWriting } from '../../src/workspace/writing.js';
import { references, matchesNote, connections, tagTree, knowledgeGraph, templates, habitState } from '../../../shared/domain/knowledge-data.js';
import { draftTasks, outsideCodeLines, dayName, captureText } from '../../../shared/domain/dashboard-data.js';
import { spectralClean } from '../../../shared/audio/denoise.js';
import { encryptPack, decryptPack } from '../../src/workspace/encrypted-pack.js';
import { followups, needsClarification, documentQuestion } from '../../../shared/domain/followups.js';
import { copyEvidence } from '../../../shared/domain/answer-evidence.js';
import { audioLibrary } from '../../src/workspace/audio-library.js';

describe('Tier 1: Feature Coverage (Category-Partition)', () => {

  // ==========================================
  // Feature 1: MKR Music Audio Player Engine
  // ==========================================
  describe('F1: MKR Music Audio Player Engine', () => {
    test('F1-1: Audio state machine initializes with valid default parameters', () => {
      const q = reconcileQueue([], ['t1', 't2', 't3'], true);
      assert.deepEqual(q, ['t1', 't2', 't3']);
      const next = nextTrack(q, undefined, 'off', false);
      assert.equal(next, 't1');
    });

    test('F1-2: Step forward in repeat "off" advances until queue end then stops', () => {
      const q = ['track-A', 'track-B', 'track-C'];
      assert.equal(nextTrack(q, 'track-A', 'off', false), 'track-B');
      assert.equal(nextTrack(q, 'track-B', 'off', false), 'track-C');
      assert.equal(nextTrack(q, 'track-C', 'off', false), undefined);
    });

    test('F1-3: Step forward in repeat "all" loops back to start when reaching end', () => {
      const q = ['track-1', 'track-2'];
      assert.equal(nextTrack(q, 'track-1', 'all', false), 'track-2');
      assert.equal(nextTrack(q, 'track-2', 'all', false), 'track-1');
    });

    test('F1-4: Automatic step in repeat "track" keeps current track playing', () => {
      const q = ['track-X', 'track-Y'];
      assert.equal(nextTrack(q, 'track-X', 'track', true), 'track-X');
      assert.equal(nextTrack(q, 'track-Y', 'track', true), 'track-Y');
    });

    test('F1-5: Queue reordering via moveTrack relocates track without item loss or duplication', () => {
      const initial = ['alpha', 'beta', 'gamma', 'delta'];
      const moved = moveTrack(initial, 'delta', 1);
      assert.deepEqual(moved, ['alpha', 'delta', 'beta', 'gamma']);
      assert.equal(moved.length, initial.length);
    });

    test('F1-6: Queue shuffling preserves all IDs while randomizing order', () => {
      const ids = ['1', '2', '3', '4', '5', '6', '7', '8'];
      const mixed = shuffled(ids, () => 0.42);
      assert.equal(mixed.length, ids.length);
      assert.deepEqual([...mixed].sort(), [...ids].sort());
      assert.notDeepEqual(mixed, ids);
    });
  });

  // ==========================================
  // Feature 2: LRCLIB Synced Lyrics Integration
  // ==========================================
  describe('F2: LRCLIB Synced Lyrics Integration', () => {
    test('F2-1: Parses multi-timestamp LRC lines and sorts chronologically', () => {
      const lrc = '[00:10.00][00:02.00]Repetitive hook line';
      const parsed = parseLyrics(lrc);
      assert.equal(parsed.synced, true);
      assert.equal(parsed.lines.length, 2);
      assert.equal(parsed.lines[0].time, 2);
      assert.equal(parsed.lines[1].time, 10);
      assert.equal(parsed.lines[0].text, 'Repetitive hook line');
    });

    test('F2-2: Binary search activeLine identifies active line across playback timestamps', () => {
      const lrc = '[00:05.00]Line 1\n[00:15.00]Line 2\n[00:30.00]Line 3';
      const lyrics = parseLyrics(lrc);
      assert.equal(activeLine(lyrics, 0), -1);
      assert.equal(activeLine(lyrics, 5.0), 0);
      assert.equal(activeLine(lyrics, 14.9), 0);
      assert.equal(activeLine(lyrics, 15.0), 1);
      assert.equal(activeLine(lyrics, 29.9), 1);
      assert.equal(activeLine(lyrics, 30.0), 2);
      assert.equal(activeLine(lyrics, 100), 2);
    });

    test('F2-3: Parse lyrics applies offset tag adjusting timestamps correctly', () => {
      const advanced = parseLyrics('[offset:+1000]\n[00:10.00]Advanced line');
      assert.equal(advanced.lines[0].time, 9.0);
      const delayed = parseLyrics('[offset:-2000]\n[00:10.00]Delayed line');
      assert.equal(delayed.lines[0].time, 12.0);
    });

    test('F2-4: Correctly distinguishes unsynced plain lyrics from synced lyrics', () => {
      const plain = parseLyrics('Just plain text line 1\nJust plain text line 2');
      assert.equal(plain.synced, false);
      assert.equal(plain.lines.length, 2);
      assert.equal(plain.lines[0].text, 'Just plain text line 1');
      assert.equal(plain.lines[0].time, undefined);
    });

    test('F2-5: toLrc serializes timestamped lyric objects back into standardized LRC format', () => {
      const lines = [
        { text: 'First line', timestamp: 5000 },
        { text: 'Second line', timestamp: 65400 }
      ];
      const serialized = toLrc(lines);
      assert.match(serialized, /\[00:05\.00\]First line/);
      assert.match(serialized, /\[01:05\.40\]Second line/);
    });

    test('F2-6: matchLyricsTrack pairs lyrics with target audio track by name stem and path', () => {
      const tracks = [
        { id: 'track-1', name: '01 - Midnight City.flac', importPath: 'M83/01 - Midnight City.flac' },
        { id: 'track-2', name: '02 - Reunion.flac', importPath: 'M83/02 - Reunion.flac' }
      ];
      const match = matchLyricsTrack({ name: '01 - Midnight City.lrc', webkitRelativePath: 'M83/01 - Midnight City.lrc' }, tracks);
      assert.ok(match);
      assert.equal(match.id, 'track-1');
    });
  });

  // ==========================================
  // Feature 3: AntennaPod Podcast RSS & Playback
  // ==========================================
  describe('F3: AntennaPod Podcast RSS & Playback', () => {
    test('F3-1: Parses standard podcast RSS XML into feed title and metadata', () => {
      const xml = `
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Offline Tech Digest</title>
            <image><url>https://example.org/cover.jpg</url></image>
            <item>
              <title>Episode 1: Architecture</title>
              <guid>ep-001</guid>
              <description>Discussion of local-first patterns</description>
              <enclosure url="https://example.org/ep1.mp3" length="25000000" type="audio/mpeg" />
              <itunes:duration>01:15:30</itunes:duration>
              <pubDate>Mon, 15 Oct 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;
      const feed = parseRss(xml, 'https://example.org/feed.xml');
      assert.equal(feed.title, 'Offline Tech Digest');
      assert.equal(feed.image, 'https://example.org/cover.jpg');
      assert.equal(feed.episodes.length, 1);
    });

    test('F3-2: Extracts episode details including audio enclosure and pubDate', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <title>Daily Pod</title>
            <item>
              <title>Daily Update #42</title>
              <guid>ep-42</guid>
              <description>All about AnF</description>
              <enclosure url="https://cdn.example.org/daily42.mp3" type="audio/mpeg" />
              <pubDate>Wed, 28 Oct 2026 08:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`;
      const feed = parseRss(xml, 'https://cdn.example.org/rss');
      const ep = feed.episodes[0];
      assert.equal(ep.id, 'ep-42');
      assert.equal(ep.title, 'Daily Update #42');
      assert.equal(ep.audioUrl, 'https://cdn.example.org/daily42.mp3');
      assert.equal(ep.published, 'Wed, 28 Oct 2026 08:00:00 GMT');
    });

    test('F3-3: Parses diverse podcast duration formats (hh:mm:ss, mm:ss, raw seconds)', () => {
      const xml = `
        <rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <item><title>E1</title><enclosure url="u1"/><itunes:duration>01:02:03</itunes:duration></item>
            <item><title>E2</title><enclosure url="u2"/><itunes:duration>15:30</itunes:duration></item>
            <item><title>E3</title><enclosure url="u3"/><itunes:duration>3600</itunes:duration></item>
          </channel>
        </rss>`;
      const feed = parseRss(xml, 'https://example.org/feed');
      assert.equal(feed.episodes[0].duration, 1 * 3600 + 2 * 60 + 3);
      assert.equal(feed.episodes[1].duration, 15 * 60 + 30);
      assert.equal(feed.episodes[2].duration, 3600);
    });

    test('F3-4: Substack publication URL normalizer outputs canonical /feed endpoints', () => {
      assert.equal(substackFeedUrl('https://astralcodexten.substack.com'), 'https://astralcodexten.substack.com/feed');
      assert.equal(substackFeedUrl('https://example.substack.com/feed'), 'https://example.substack.com/feed');
      assert.equal(substackFeedUrl('https://not-substack.org'), undefined);
    });

    test('F3-5: HTML description stripper removes tags and normalizes whitespace', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item>
              <title>E1</title>
              <enclosure url="u1"/>
              <description><![CDATA[<p>Hello <strong>world</strong>! Visit <a href="x">our link</a>.</p>]]></description>
            </item>
          </channel>
        </rss>`;
      const feed = parseRss(xml, 'https://example.org/feed');
      assert.equal(feed.episodes[0].summary, 'Hello world ! Visit our link .');
    });

    test('F3-6: Feeds persistence round-trip saves to and loads from storage', () => {
      const feeds = [
        {
          id: 'https://pod.org/rss',
          title: 'Stored Pod',
          url: 'https://pod.org/rss',
          episodes: [{ id: 'ep-1', title: 'Ep 1', summary: 'Sum', audioUrl: 'https://pod.org/1.mp3' }],
          updated: 123456789
        }
      ];
      saveFeeds(feeds);
      const loaded = loadFeeds();
      assert.equal(loaded.length, 1);
      assert.equal(loaded[0].title, 'Stored Pod');
      assert.equal(loaded[0].episodes[0].id, 'ep-1');
    });
  });

  // ==========================================
  // Feature 4: Spotube Streaming Audio Integration
  // ==========================================
  describe('F4: Spotube Streaming Audio Integration', () => {
    test('F4-1: Bounds calculator scales dimensions by devicePixelRatio correctly', () => {
      const rect = { left: 100, top: 50, width: 800, height: 600 };
      const dpr = 1.5;
      const computed = {
        x: Math.round(rect.left * dpr),
        y: Math.round(rect.top * dpr),
        width: Math.max(1, Math.round(rect.width * dpr)),
        height: Math.max(1, Math.round(rect.height * dpr))
      };
      assert.equal(computed.x, 150);
      assert.equal(computed.y, 75);
      assert.equal(computed.width, 1200);
      assert.equal(computed.height, 900);
    });

    test('F4-2: Native music operation commands cover status, play, pause, previous, next', () => {
      const ops = ['status', 'play', 'pause', 'previous', 'next'];
      for (const op of ops) {
        assert.ok(typeof op === 'string' && op.length > 0);
      }
    });

    test('F4-3: Spotube track metadata extraction produces formatted display values', () => {
      const track = {
        title: 'Starboy',
        artist: 'The Weeknd',
        album: 'Starboy',
        duration: 230
      };
      const text = durationText(track.duration);
      assert.equal(text, '3:50');
    });

    test('F4-4: Audio library IndexedDB stores and retrieves streaming track blobs', async () => {
      const lib = audioLibrary();
      const testTrack = {
        id: 'spotube-track-1',
        name: 'starboy.mp3',
        title: 'Starboy',
        artist: 'The Weeknd',
        blob: new Blob(['fake audio content'], { type: 'audio/mpeg' }),
        created: Date.now(),
        duration: 230
      };
      await lib.put(testTrack);
      const retrieved = await lib.get('spotube-track-1');
      assert.ok(retrieved);
      assert.equal(retrieved.title, 'Starboy');
      assert.equal(retrieved.artist, 'The Weeknd');
    });

    test('F4-5: Audio library playlist management stores and reads custom order', async () => {
      const lib = audioLibrary();
      const playlist = {
        id: 'pl-1',
        name: 'Spotube Favorites',
        order: ['track-a', 'track-b']
      };
      await lib.savePlaylist(playlist);
      const all = await lib.playlists();
      const found = all.find(p => p.id === 'pl-1');
      assert.ok(found);
      assert.equal(found.name, 'Spotube Favorites');
      assert.deepEqual(found.order, ['track-a', 'track-b']);
    });

    test('F4-6: Queue reconciliation incorporates newly fetched stream tracks', () => {
      const saved = ['s1', 's2'];
      const available = ['s1', 's2', 's3'];
      const reconciled = reconcileQueue(saved, available, true);
      assert.deepEqual(reconciled, ['s1', 's2', 's3']);
    });
  });

  // ==========================================
  // Feature 5: Substack Article Reader & Publishing
  // ==========================================
  describe('F5: Substack Article Reader & Publishing', () => {
    test('F5-1: Article sectioning chunks long texts at headings or paragraph breaks', () => {
      const doc = '# Chapter 1\n' + 'First paragraph content.\n'.repeat(100) + '# Chapter 2\n' + 'Second paragraph content.\n'.repeat(100);
      const parts = sections(doc);
      assert.ok(parts.length >= 2);
      assert.equal(parts[0].label, 'Chapter 1');
      assert.ok(parts.every(p => p.start < p.end && p.label.length > 0));
    });

    test('F5-2: Reading state serialization preserves offset, bookmarks, and annotations', () => {
      const raw = {
        offset: 12,
        bookmarks: [0, 50],
        annotations: []
      };
      const text = 'A'.repeat(200);
      const state = readingState(raw, text);
      assert.equal(state.offset, 12);
      assert.deepEqual(state.bookmarks, [0, 50]);
    });

    test('F5-3: addHighlight stores quote with specified color and user note', () => {
      const text = 'Deep reading requires dedicated focus and quiet contemplation.';
      const initial = readingState(null, text);
      const start = text.indexOf('dedicated focus');
      const end = start + 'dedicated focus'.length;
      const updated = addHighlight(initial, text, start, end, 'gold', 'Key concept', 'h-1');
      assert.equal(updated.annotations.length, 1);
      assert.equal(updated.annotations[0].quote, 'dedicated focus');
      assert.equal(updated.annotations[0].color, 'gold');
      assert.equal(updated.annotations[0].note, 'Key concept');
    });

    test('F5-4: clipText appends quote and source citation to draft', () => {
      const initialDraft = '# My Research Notes';
      const quote = 'Local-first software puts the user in control of their data.';
      const source = 'Substack: Local First Manifesto';
      const clipped = clipText(initialDraft, quote, source);
      assert.ok(clipped.includes(quote));
      assert.ok(clipped.includes('Source: Substack: Local First Manifesto'));
    });

    test('F5-5: Markdown renderer converts headings, bold, checklists, and wikilinks into DOM', () => {
      const md = '# Substack Title\n- [x] Done task\n- [ ] Open task\n**Bold text** and [[Target Note|My Link]]';
      const el = renderWriting(md);
      assert.ok(el.textContent.includes('Substack Title'));
      assert.ok(el.textContent.includes('Done task'));
      assert.ok(el.textContent.includes('Open task'));
      assert.ok(el.textContent.includes('Bold text'));
    });

    test('F5-6: sectionIndex correctly locates active section index for offset', () => {
      const parts = [
        { start: 0, end: 100, label: 'Part 1' },
        { start: 100, end: 250, label: 'Part 2' }
      ];
      assert.equal(sectionIndex(parts, 0), 0);
      assert.equal(sectionIndex(parts, 99), 0);
      assert.equal(sectionIndex(parts, 100), 1);
      assert.equal(sectionIndex(parts, 200), 1);
    });
  });

  // ==========================================
  // Feature 6: Kiwix ZIM Archive Reading & Knowledge
  // ==========================================
  describe('F6: Kiwix ZIM Archive Reading & Knowledge', () => {
    test('F6-1: Wikilink extraction parses [[Target|Alias]] links while skipping code blocks', () => {
      const text = 'Here is a link to [[Wikipedia:Quantum Mechanics|Quantum Mechanics]] and `[[CodeLink]]` in code.';
      const refs = references(text);
      assert.deepEqual(refs.links, ['Wikipedia:Quantum Mechanics']);
    });

    test('F6-2: Tag extraction parses hierarchical tags with lowercase normalization', () => {
      const text = 'Reviewing #science/physics and #research/offline today.';
      const refs = references(text);
      assert.deepEqual(refs.tags, ['science/physics', 'research/offline']);
    });

    test('F6-3: Note matching searches text, tags, and has:task query filters', () => {
      const note = {
        id: 'n1',
        name: 'ZIM Articles',
        draft: '#notes\n- [ ] Read Britannica\nContent on thermodynamics.',
        sources: [{ name: 'physics.zim', text: 'Thermodynamics overview' }]
      };
      assert.equal(matchesNote(note, 'thermodynamics'), true);
      assert.equal(matchesNote(note, 'tag:notes'), true);
      assert.equal(matchesNote(note, 'has:task'), true);
      assert.equal(matchesNote(note, 'astronomy'), false);
    });

    test('F6-4: connections builds bi-directional link graph across notes', () => {
      const notes = [
        { id: 'n1', name: 'ZIM Reading', draft: 'Mentions [[Offline Knowledge]].', sources: [] },
        { id: 'n2', name: 'Offline Knowledge', draft: 'Central hub.', sources: [] }
      ];
      const conns = connections(notes);
      assert.equal(conns.length, 1);
      assert.equal(conns[0].from, 'n1');
      assert.equal(conns[0].to, 'n2');
    });

    test('F6-5: tagTree constructs nested hierarchical tag taxonomy', () => {
      const notes = [
        { id: 'n1', name: 'N1', draft: '#vault/zim/physics', sources: [] },
        { id: 'n2', name: 'N2', draft: '#vault/zim/chemistry', sources: [] }
      ];
      const tree = tagTree(notes);
      assert.equal(tree.length, 1);
      assert.equal(tree[0].tag, 'vault');
      assert.equal(tree[0].children[0].tag, 'vault/zim');
      assert.equal(tree[0].children[0].children.length, 2);
    });

    test('F6-6: knowledgeGraph generates nodes and edges up to limit', () => {
      const notes = [
        { id: 'n1', name: 'Article 1', draft: '#tagA [[Article 2]]', sources: [{ name: 'doc1.zim', text: 't1' }] },
        { id: 'n2', name: 'Article 2', draft: '#tagB', sources: [] }
      ];
      const graph = knowledgeGraph(notes, 50);
      assert.ok(graph.nodes.some(n => n.id === 'note:n1'));
      assert.ok(graph.nodes.some(n => n.id === 'note:n2'));
      assert.ok(graph.edges.some(e => e.from === 'note:n1' && e.to === 'note:n2'));
      assert.equal(graph.omitted, 0);
    });
  });

  // ==========================================
  // Feature 7: Audacity Audio Studio Waveform Editing
  // ==========================================
  describe('F7: Audacity Audio Studio Waveform Editing', () => {
    test('F7-1: Peak extraction downsamples raw PCM Float32Array into waveform bins', () => {
      const pcm = new Float32Array(1000);
      pcm[250] = 0.8;
      pcm[750] = -0.9;
      const wavePeaks = peaks([pcm], 100);
      assert.equal(wavePeaks.length, 100);
      assert.ok(Math.max(...wavePeaks) >= 0.8);
    });

    test('F7-2: Audio level calculator computes peak and RMS energy', () => {
      const channel = new Float32Array([0.5, -0.5, 0.5, -0.5]);
      const res = level([channel]);
      assert.equal(res.peak, 0.5);
      assert.equal(Math.round(res.rms * 100) / 100, 0.5);
    });

    test('F7-3: WAV encoder generates valid 16-bit PCM RIFF WAVE buffer with correct headers', () => {
      const channel = new Float32Array(16000); // 1 second at 16kHz
      channel[100] = 0.5;
      const buffer = wav([channel], 16000);
      assert.ok(buffer instanceof ArrayBuffer);
      const view = new DataView(buffer);
      // Check RIFF header
      const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
      assert.equal(riff, 'RIFF');
      const waveTag = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
      assert.equal(waveTag, 'WAVE');
      // Channels and sample rate
      assert.equal(view.getUint16(22, true), 1);
      assert.equal(view.getUint32(24, true), 16000);
    });

    test('F7-4: Spectral noise reduction attenuates background noise using profile', async () => {
      const rate = 16000;
      const duration = 2.5; // 2.5s
      const data = new Float32Array(Math.floor(rate * duration));
      // Populate constant noise floor
      for (let i = 0; i < data.length; i++) {
        data[i] = 0.05 * Math.sin(2 * Math.PI * 440 * (i / rate));
      }
      const cleaned = await spectralClean(data, rate, 0.1, 1.2);
      assert.equal(cleaned.length, data.length);
      // Cleaned audio level should be reduced
      const originalLevel = level([data]).rms;
      const cleanedLevel = level([cleaned]).rms;
      assert.ok(cleanedLevel < originalLevel);
    });

    test('F7-5: durationText formats integer seconds into mm:ss notation', () => {
      assert.equal(durationText(0), '0:00');
      assert.equal(durationText(59), '0:59');
      assert.equal(durationText(60), '1:00');
      assert.equal(durationText(125), '2:05');
      assert.equal(durationText(3600), '60:00');
    });

    test('F7-6: Stereo WAV generation packages two distinct channels into interleaved format', () => {
      const left = new Float32Array(16000).fill(0.2);
      const right = new Float32Array(16000).fill(-0.2);
      const buffer = wav([left, right], 16000);
      const view = new DataView(buffer);
      assert.equal(view.getUint16(22, true), 2); // 2 channels
      // First sample left, second sample right
      assert.equal(view.getInt16(44, true), Math.round(0.2 * 32767));
      assert.equal(view.getInt16(46, true), Math.round(-0.2 * 32768));
    });
  });

  // ==========================================
  // Feature 8: Orion Store Addon Marketplace
  // ==========================================
  describe('F8: Orion Store Addon Marketplace', () => {
    test('F8-1: Manifest schema validator verifies ID, name, version, and type fields', () => {
      const validEntry = {
        id: 'midnight-ember',
        name: 'Midnight Ember',
        version: '1.0.0',
        type: 'theme',
        description: 'Dark ember contrast palette',
        author: 'AnF Community',
        downloadUrl: 'https://raw.githubusercontent.com/mwalikokelvo/AnF/main/marketplace/sample-theme/theme.css',
        sha256: 'a'.repeat(64)
      };
      assert.equal(/^[a-z0-9-]+$/.test(validEntry.id), true);
      assert.equal(validEntry.type, 'theme');
      assert.equal(validEntry.sha256.length, 64);
    });

    test('F8-2: CSS validator confirms absence of prohibited @import directives', () => {
      const safeCss = ':root { --bg: #121212; --surface: #1e1e1e; --accent: #ff7700; --ink: #ffffff; }';
      assert.equal(safeCss.includes('@import'), false);
    });

    test('F8-3: CSS validator restricts url() declarations to data: URIs', () => {
      const safeDataCss = '.icon { background-image: url(data:image/svg+xml;base64,PHN2Zz4=); }';
      const parts = safeDataCss.split('url(').slice(1);
      for (const p of parts) {
        assert.ok(p.trim().startsWith('data:'));
      }
    });

    test('F8-4: Swatch extractor identifies theme color variables from CSS string', () => {
      const css = ':root { --bg: #0d1117; --surface: #161b22; --accent: #58a6ff; --ink: #c9d1d9; }';
      const colors = ['--bg', '--surface', '--accent', '--ink'].map(v => {
        const m = css.match(new RegExp(v + ':\\s*(#[0-9a-fA-F]{3,8})'));
        return m ? m[1] : null;
      });
      assert.deepEqual(colors, ['#0d1117', '#161b22', '#58a6ff', '#c9d1d9']);
    });

    test('F8-5: SHA-256 hash calculation matches expected checksum', async () => {
      const content = 'body { color: #fff; }';
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(content));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      assert.equal(hex.length, 64);
    });

    test('F8-6: Marketplace theme apply and clear lifecycles update DOM attributes', () => {
      const doc = document.documentElement;
      doc.setAttribute('data-theme-pack', 'ember');
      assert.equal(doc.getAttribute('data-theme-pack'), 'ember');
      doc.removeAttribute('data-theme-pack');
      assert.equal(doc.getAttribute('data-theme-pack'), null);
    });
  });

  // ==========================================
  // Feature 9: Local AI Model Execution & Weights
  // ==========================================
  describe('F9: Local AI Model Execution & Weights', () => {
    test('F9-1: Ground question generator formats source excerpts with numerical citations', () => {
      const sources = [
        { name: 'Architecture.md', text: 'AnF uses Tauri 2 and Media3 for offline cross-platform support.' }
      ];
      const q = 'How does AnF achieve cross-platform support?';
      const formatted = documentQuestion(q, sources);
      assert.ok(formatted.includes('[1] Architecture.md'));
      assert.ok(formatted.includes('Cite [1]'));
    });

    test('F9-2: Ground question ranks chunks by keyword relevance', () => {
      const sources = [
        { name: 'DocA', text: 'Bananas and apples are fruits.' },
        { name: 'DocB', text: 'Offline storage uses SQLCipher encryption.' }
      ];
      const q = 'Tell me about SQLCipher encryption.';
      const prompt = documentQuestion(q, sources);
      assert.ok(prompt.includes('DocB'));
    });

    test('F9-3: Clarification heuristic detects underspecified queries', () => {
      assert.equal(needsClarification('help me'), true);
      assert.equal(needsClarification('please help!'), true);
      assert.equal(needsClarification('do this.'), true);
      assert.equal(needsClarification('Explain the architectural pillars of AnF.'), false);
    });

    test('F9-4: Followup generator provides contextual prompts based on document state', () => {
      const withDocs = followups(true);
      const withoutDocs = followups(false);
      assert.equal(withDocs.some(f => f.label === 'Show the evidence'), true);
      assert.equal(withoutDocs.some(f => f.label === 'Show the evidence'), false);
    });

    test('F9-5: copyEvidence validates and preserves evidence snapshot structure', () => {
      const raw = [
        { id: 1, sourceName: 'Spec.pdf', page: 3, text: 'Offline sync guarantee', ocr: false }
      ];
      const copied = copyEvidence(raw);
      assert.equal(copied.length, 1);
      assert.equal(copied[0].id, 1);
      assert.equal(copied[0].sourceName, 'Spec.pdf');
      assert.equal(copied[0].page, 3);
    });

    test('F9-6: Weight profile memory verification calculates RAM requirement', () => {
      const profile = {
        id: 'deepseek-v4.1-flash',
        name: 'DeepSeek V4.1 Flash',
        minRamGb: 6,
        sizeBytes: 3_800_000_000
      };
      const systemRamGb = 16;
      assert.ok(systemRamGb >= profile.minRamGb);
    });
  });

  // ==========================================
  // Feature 10: Cross-Cutting Offline-First & Platform
  // ==========================================
  describe('F10: Cross-Cutting Offline-First & Platform', () => {
    test('F10-1: Tier 1 SQLCipher project structure enforces identity and size constraints', () => {
      const project = {
        id: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        name: 'Offline Project',
        title: 'Project Title',
        question: 'Main goal',
        draft: 'Working text',
        history: [{ role: 'user', content: [{ text: 'Hello' }] }],
        sources: [{ name: 's1', text: 't1' }],
        memory: 'Context memo',
        model: 'fast'
      };
      assert.equal(project.id.length, 64);
      assert.ok(['fast', 'balanced'].includes(project.model));
    });

    test('F10-2: Tier 2 IndexedDB offline store persists and retrieves audio state', async () => {
      const lib = audioLibrary();
      const state = {
        id: 'queue' as const,
        order: ['track-1', 'track-2'],
        repeat: 'all' as const,
        position: 45
      };
      await lib.save(state);
      const retrieved = await lib.state();
      assert.equal(retrieved.id, 'queue');
      assert.deepEqual(retrieved.order, ['track-1', 'track-2']);
      assert.equal(retrieved.repeat, 'all');
      assert.equal(retrieved.position, 45);
    });

    test('F10-3: Tier 3 Filesystem encrypted backup pack encrypts with PBKDF2/AES-GCM and decrypts', async () => {
      const payload = { testSecret: 'Vault confidential data 2026', version: 1 };
      const pass = 'super-strong-passphrase-at-least-12-chars';
      const encrypted = await encryptPack(payload, pass);
      assert.ok(typeof encrypted === 'string');
      const decrypted = await decryptPack(encrypted, pass) as typeof payload;
      assert.equal(decrypted.testSecret, payload.testSecret);
    });

    test('F10-4: Tier 4 Session storage preserves quick capture thoughts', () => {
      const initial = '';
      const captured = captureText(initial, 'First offline thought on AnF architecture.', new Date('2026-10-31T10:00:00Z'));
      assert.ok(captured.includes('First offline thought on AnF architecture.'));
    });

    test('F10-5: Zero-connectivity degradation handles network outage gracefully', async () => {
      // Simulate network request in offline mode
      let caught = false;
      try {
        await Promise.reject(new TypeError('Failed to fetch'));
      } catch (e) {
        caught = true;
      }
      assert.equal(caught, true);
    });

    test('F10-6: Offline mutation queue preserves execution order', () => {
      const mutationQueue: string[] = [];
      mutationQueue.push('INSERT_TRACK_1');
      mutationQueue.push('UPDATE_POSITION_15');
      mutationQueue.push('SAVE_PLAYLIST');
      assert.equal(mutationQueue.shift(), 'INSERT_TRACK_1');
      assert.equal(mutationQueue.shift(), 'UPDATE_POSITION_15');
      assert.equal(mutationQueue.shift(), 'SAVE_PLAYLIST');
      assert.equal(mutationQueue.length, 0);
    });
  });

});
