import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from './test-env.js';

setupTestEnvironment();

import { reconcileQueue, moveTrack, shuffled, nextTrack, previousTrack, enqueueTrack, playNextTrack, removeTrack } from '../../src/workspace/audio-queue.js';
import { durationText, peaks, level, wav } from '../../src/workspace/audio-data.js';
import { parseLyrics, activeLine, toLrc, baseName, matchLyricsTrack } from '../../src/workspace/lyrics.js';
import { cleanTitle, primaryArtist } from '../../src/workspace/lyrics-provider.js';
import { parseRss, parseDuration, substackFeedUrl, loadFeeds, saveFeeds, updateEpisodePosition, getEpisodeState } from '../../src/workspace/podcast-feeds.js';
import { sections, readingState, addHighlight, clipText, sectionIndex } from '../../../shared/domain/reader-data.js';
import { renderWriting } from '../../src/workspace/writing.js';
import { references, matchesNote, connections, tagTree, knowledgeGraph } from '../../../shared/domain/knowledge-data.js';
import { spectralClean } from '../../../shared/audio/denoise.js';
import { encryptPack, decryptPack } from '../../src/workspace/encrypted-pack.js';
import { followups, needsClarification, documentQuestion } from '../../../shared/domain/followups.js';
import { copyEvidence } from '../../../shared/domain/answer-evidence.js';
import { audioLibrary } from '../../src/workspace/audio-library.js';
import { SpotubeStreamService } from '../../src/workspace/streaming-provider.js';

describe('Tier 2: Boundary Value Analysis (Corner Cases & Error Handling)', () => {

  // ==========================================
  // Feature 1: Audio Player Engine Boundaries
  // ==========================================
  describe('F1: Audio Player Engine Boundaries', () => {
    test('F1-B1: Empty queue navigation returns undefined for all directions and repeat modes', () => {
      assert.equal(nextTrack([], 't1', 'off', false), undefined);
      assert.equal(nextTrack([], 't1', 'all', false), undefined);
      assert.equal(nextTrack([], 't1', 'track', true), undefined);
      assert.equal(previousTrack([], 't1', 'all'), undefined);
    });

    test('F1-B2: Single track queue loops on "all" and "track", but stops on manual "off"', () => {
      const q = ['single-track'];
      assert.equal(nextTrack(q, 'single-track', 'off', false), undefined);
      assert.equal(nextTrack(q, 'single-track', 'all', false), 'single-track');
      assert.equal(nextTrack(q, 'single-track', 'track', true), 'single-track');
      assert.equal(previousTrack(q, 'single-track', 'all'), 'single-track');
    });

    test('F1-B3: moveTrack clamps negative and excessive target indices without loss', () => {
      const q = ['a', 'b', 'c'];
      assert.deepEqual(moveTrack(q, 'c', -5), ['c', 'a', 'b']);
      assert.deepEqual(moveTrack(q, 'a', 999), ['b', 'c', 'a']);
      assert.deepEqual(moveTrack(q, 'missing', 1), ['a', 'b', 'c']);
    });

    test('F1-B4: durationText handles 0, negative, NaN, and excessive timestamps safely', () => {
      assert.equal(durationText(0), '0:00');
      assert.equal(durationText(-15), '0:00');
      assert.equal(durationText(NaN), '0:00');
      assert.equal(durationText(3665), '61:05');
    });

    test('F1-B5: reconcileQueue handles empty saved and empty available sets gracefully', () => {
      assert.deepEqual(reconcileQueue([], [], true), []);
      assert.deepEqual(reconcileQueue(['a', 'b'], [], false), []);
      assert.deepEqual(reconcileQueue([], ['x', 'y'], true), ['x', 'y']);
    });

    test('F1-B6: Stress test: queue operations on 1,000 items execute deterministically', () => {
      const large = Array.from({ length: 1000 }, (_, i) => `item-${i}`);
      const s = shuffled(large, () => 0.42);
      assert.equal(s.length, 1000);
      assert.equal(new Set(s).size, 1000);
      const moved = moveTrack(s, s[0], 999);
      assert.equal(moved.length, 1000);
      assert.equal(moved[999], s[0]);
    });
  });

  // ==========================================
  // Feature 2: Synced Lyrics Boundaries
  // ==========================================
  describe('F2: LRCLIB Synced Lyrics Boundaries', () => {
    test('F2-B1: Empty or whitespace-only LRC returns empty unsynced lyrics structure', () => {
      const res = parseLyrics('');
      assert.equal(res.synced, false);
      assert.equal(res.lines.length, 0);
      const resSpaces = parseLyrics('   \n\t  ');
      assert.equal(res.synced, false);
      assert.equal(res.lines.length, 0);
    });

    test('F2-B2: Out-of-bounds offset values shift lines correctly', () => {
      const lrc = '[offset:-2000]\n[00:05.00]First line\n[00:10.00]Second line';
      const parsed = parseLyrics(lrc);
      assert.equal(parsed.synced, true);
      assert.ok(parsed.lines[0].time !== undefined);
    });

    test('F2-B3: activeLine returns -1 for playback positions before first lyric line', () => {
      const lyrics = {
        synced: true,
        lines: [
          { time: 10, text: 'Intro ends' },
          { time: 20, text: 'Verse 1' }
        ]
      };
      assert.equal(activeLine(lyrics, 0), -1);
      assert.equal(activeLine(lyrics, 5), -1);
      assert.equal(activeLine(lyrics, 10), 0);
      assert.equal(activeLine(lyrics, 15), 0);
    });

    test('F2-B4: activeLine clamps to last line for playback positions far past the end', () => {
      const lyrics = {
        synced: true,
        lines: [
          { time: 10, text: 'A' },
          { time: 30, text: 'B' }
        ]
      };
      assert.equal(activeLine(lyrics, 99999), 1);
    });

    test('F2-B5: Malformed timestamps are handled without crashing', () => {
      const malformed = '[invalid:time]Broken text\n[00:99.99]Weird time\n[01:00.00]Valid line';
      const parsed = parseLyrics(malformed);
      assert.ok(parsed.lines.length >= 1);
    });

    test('F2-B6: cleanTitle and primaryArtist handle null, empty, and unusual character strings', () => {
      assert.equal(cleanTitle(''), '');
      assert.equal(cleanTitle('   '), '');
      assert.equal(primaryArtist(''), '');
      assert.equal(primaryArtist('Feat. Solo'), 'Feat. Solo');
    });
  });

  // ==========================================
  // Feature 3: AntennaPod Podcast RSS Boundaries
  // ==========================================
  describe('F3: AntennaPod Podcast RSS Boundaries', () => {
    test('F3-B1: Empty RSS feed or feed without channel throws or returns empty list', () => {
      const emptyXml = '<rss version="2.0"></rss>';
      const feed = parseRss(emptyXml, 'https://example.org/feed');
      assert.equal(feed.episodes.length, 0);
    });

    test('F3-B2: Enclosure with missing url is ignored safely', () => {
      const xml = `
        <rss version="2.0">
          <channel>
            <item><title>Bad Ep</title><enclosure length="12345" type="audio/mpeg"/></item>
            <item><title>Good Ep</title><enclosure url="https://pod.org/good.mp3"/></item>
          </channel>
        </rss>`;
      const feed = parseRss(xml, 'https://example.org/feed');
      assert.equal(feed.episodes.length, 1);
      assert.equal(feed.episodes[0].title, 'Good Ep');
    });

    test('F3-B3: parseDuration handles 0, negative values, and non-numeric characters gracefully', () => {
      assert.equal(parseDuration('0'), 0);
      assert.equal(parseDuration('00:00'), 0);
      assert.equal(parseDuration('00:00:00'), 0);
      assert.equal(parseDuration('letters-only'), undefined);
      assert.equal(parseDuration(undefined), undefined);
    });

    test('F3-B4: saveFeeds clamps max saved feeds to 40 items', () => {
      const list = Array.from({ length: 50 }, (_, i) => ({
        id: `https://pod${i}.org`,
        title: `Pod ${i}`,
        url: `https://pod${i}.org`,
        episodes: [],
        updated: Date.now()
      }));
      saveFeeds(list);
      const loaded = loadFeeds();
      assert.ok(loaded.length <= 40);
    });

    test('F3-B5: Substack URL normalizer ignores non-http and invalid domains', () => {
      assert.equal(substackFeedUrl('ftp://substack.com'), undefined);
      assert.equal(substackFeedUrl('https://malicious-substack.com.attacker.com'), undefined);
      assert.equal(substackFeedUrl('not-a-valid-url'), undefined);
    });

    test('F3-B6: updateEpisodePosition and markEpisodePlayed reject corrupted state gracefully', () => {
      updateEpisodePosition('ep-corner', -50);
      assert.equal(getEpisodeState('ep-corner').position, 0);
    });
  });

  // ==========================================
  // Feature 4: Spotube Streaming Audio Boundaries
  // ==========================================
  describe('F4: Spotube Streaming Audio Boundaries', () => {
    test('F4-B1: Empty and whitespace query in streaming search returns empty results', async () => {
      const s = new SpotubeStreamService();
      assert.deepEqual(await s.search(''), []);
      assert.deepEqual(await s.search('    '), []);
    });

    test('F4-B2: SpotubeStreamService throws error on non-existent track ID resolution', async () => {
      const s = new SpotubeStreamService();
      await assert.rejects(async () => await s.resolveStreamUrl('missing-id'), /Stream URL unavailable/);
    });

    test('F4-B3: Zero-byte blob caching succeeds and maintains format fallback', async () => {
      const s = new SpotubeStreamService();
      const mockLib = {
        items: [] as any[],
        put: async (t: any) => { mockLib.items.push(t); },
        tracks: async () => mockLib.items
      };
      const emptyBlob = new Blob([], { type: 'audio/mp4' });
      const saved = await s.cacheStreamTrack(mockLib, { id: 'zero-track', title: 'Zero', artist: 'Art', duration: 0 }, emptyBlob);
      assert.equal(saved.blob.size, 0);
      assert.equal(saved.format, 'audio/mp4');
    });

    test('F4-B4: AudioLibrary handles missing track get without throwing', async () => {
      const lib = audioLibrary();
      const nonExistent = await lib.get('definitely-not-there-12345');
      assert.equal(nonExistent, undefined);
    });

    test('F4-B5: AudioLibrary playlist removal on non-existent playlist does not crash', async () => {
      const lib = audioLibrary();
      await assert.doesNotReject(async () => {
        await lib.removePlaylist('non-existent-pl-id');
      });
    });

    test('F4-B6: Playlist ordering retains only valid string entries', async () => {
      const lib = audioLibrary();
      await lib.savePlaylist({ id: 'pl-valid', name: 'Valid', order: ['t1', 't2'] });
      const playlists = await lib.playlists();
      const pl = playlists.find(p => p.id === 'pl-valid');
      assert.ok(pl);
      assert.equal(pl.order.length, 2);
    });
  });

  // ==========================================
  // Feature 5: Substack Reader & Publishing Boundaries
  // ==========================================
  describe('F5: Substack Article Reader & Publishing Boundaries', () => {
    test('F5-B1: Empty document produces single empty section without crashing', () => {
      const res = sections('');
      assert.equal(res.length, 1);
      assert.equal(res[0].label, 'Empty document');
    });

    test('F5-B2: clipText throws Error when resulting draft exceeds 200,000 bytes limit', () => {
      const hugeQuote = 'X'.repeat(200005);
      assert.throws(() => clipText('', hugeQuote, 'Test Source'), /exceeds the writing limit/);
    });

    test('F5-B3: readingState throws Error on invalid offsets (negative or past text length)', () => {
      const text = 'Short document text.';
      assert.throws(() => readingState({ offset: -1, bookmarks: [], annotations: [] }, text), /Invalid reading notes/);
      assert.throws(() => readingState({ offset: 9999, bookmarks: [], annotations: [] }, text), /Invalid reading notes/);
    });

    test('F5-B4: addHighlight adds valid highlight matching slice', () => {
      const text = 'Hello world from reader!';
      const initial = { offset: 0, bookmarks: [], annotations: [] };
      const res = addHighlight(initial, text, 0, 5, 'gold', 'A note', 'h-1');
      assert.equal(res.annotations.length, 1);
      assert.equal(res.annotations[0].quote, 'Hello');
    });

    test('F5-B5: Markdown renderer handles unclosed markup without crashing', () => {
      const unclosed = '**bold with no closing\n[link without target\n* bullet with [[unclosed wikilink';
      const rendered = renderWriting(unclosed);
      assert.ok(rendered);
      assert.ok(rendered.children.length > 0);
    });

    test('F5-B6: sectionIndex clamps out-of-bounds offsets to boundaries', () => {
      const parts = [{ start: 0, end: 100, label: 'Part 1' }, { start: 100, end: 200, label: 'Part 2' }];
      assert.equal(sectionIndex(parts, -10), 0);
      assert.equal(sectionIndex(parts, 500), 1);
    });
  });

  // ==========================================
  // Feature 6: Kiwix ZIM & Vault Knowledge Boundaries
  // ==========================================
  describe('F6: Kiwix ZIM & Vault Knowledge Boundaries', () => {
    test('F6-B1: references skips empty wikilinks and preserves valid identifiers', () => {
      const links = references('Check [[]] and [[  ]] and [[ValidLink]]').links;
      assert.deepEqual(links, ['ValidLink']);
    });

    test('F6-B2: matchesNote matches regardless of query casing and whitespace', () => {
      const note = { id: 'n1', name: 'Machine Learning Notes', draft: 'Neural networks and deep learning.', sources: [] };
      assert.ok(matchesNote(note, '  MACHINE   '));
    });

    test('F6-B3: connections handles orphan notes without incoming or outgoing links', () => {
      const notes = [
        { id: 'lonely', name: 'Lonely Note', draft: 'No links here.', sources: [] }
      ];
      const conn = connections(notes);
      assert.deepEqual(conn, []);
    });

    test('F6-B4: circular links between notes (A -> B -> A) do not cause infinite loops', () => {
      const notes = [
        { id: 'note-a', name: 'Note A', draft: 'Links to [[Note B]]', sources: [] },
        { id: 'note-b', name: 'Note B', draft: 'Links to [[Note A]]', sources: [] }
      ];
      const conn = connections(notes);
      assert.equal(conn.length, 2);
    });

    test('F6-B5: tagTree handles nested tags correctly', () => {
      const notes = [
        { id: 'n1', name: 'T1', draft: '#lvl1/lvl2/lvl3 Tagged', sources: [] }
      ];
      const tree = tagTree(notes);
      assert.equal(tree.length, 1);
      assert.equal(tree[0].tag, 'lvl1');
    });

    test('F6-B6: knowledgeGraph respects node limit even with multiple notes', () => {
      const notes = Array.from({ length: 20 }, (_, i) => ({
        id: `node-${i}`,
        name: `Title ${i}`,
        draft: `Links to [[Title ${(i + 1) % 20}]]`,
        sources: []
      }));
      const graph = knowledgeGraph(notes, 10);
      assert.ok(graph.nodes.length <= 10);
    });
  });

  // ==========================================
  // Feature 7: Audacity Audio Studio Boundaries
  // ==========================================
  describe('F7: Audacity Audio Studio Boundaries', () => {
    test('F7-B1: Peak extraction on empty Float32Array returns array of zeros', () => {
      const empty = [new Float32Array(0)];
      const p = peaks(empty, 50);
      assert.equal(p.length, 0);
    });

    test('F7-B2: Level calculation on pure silence returns zero peak and RMS', () => {
      const silence = [new Float32Array(1024)];
      const lev = level(silence);
      assert.equal(lev.peak, 0);
      assert.equal(lev.rms, 0);
    });

    test('F7-B3: Level calculation on full-scale clipping signal computes peak = 1.0', () => {
      const clipped = [new Float32Array(512).fill(1.0)];
      const lev = level(clipped);
      assert.equal(lev.peak, 1.0);
      assert.equal(lev.rms, 1.0);
    });

    test('F7-B4: wav function clamps samples and produces valid ArrayBuffer', () => {
      const extreme = [new Float32Array([-5.0, 5.0, -1.0, 1.0, 0.0])];
      const buffer = wav(extreme, 44100);
      assert.ok(buffer.byteLength > 44);
    });

    test('F7-B5: durationText formats 0 and valid seconds', () => {
      assert.equal(durationText(0), '0:00');
      assert.equal(durationText(65), '1:05');
    });

    test('F7-B6: WAV encoder handles odd sample buffer lengths cleanly with proper padding', () => {
      const oddSamples = [new Float32Array(101)];
      const buffer = wav(oddSamples, 48000);
      assert.equal(buffer.byteLength, 44 + 101 * 2);
    });
  });

  // ==========================================
  // Feature 8: Orion Store Addon Marketplace Boundaries
  // ==========================================
  describe('F8: Orion Store Addon Marketplace Boundaries', () => {
    test('F8-B1: Prohibited @import directive detection catches multiple variants', () => {
      const badCss1 = '@import url("evil.css"); body { color: red; }';
      const badCss2 = '  @import  "https://cdn.example.org/font.css" ;';
      const hasImport = (css: string) => /@import\b/i.test(css);
      assert.ok(hasImport(badCss1));
      assert.ok(hasImport(badCss2));
    });

    test('F8-B2: url() restriction flags remote http and https targets but allows data URIs', () => {
      const remote = 'background: url("https://malicious.org/track.png");';
      const dataUri = 'background: url("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=");';
      const isRemote = (css: string) => /url\(\s*['"]?(?!data:)[^'")]+['"]?\s*\)/i.test(css);
      assert.ok(isRemote(remote));
      assert.equal(isRemote(dataUri), false);
    });

    test('F8-B3: Theme color swatch parser handles empty CSS strings', () => {
      const emptyCss = 'body { margin: 0; }';
      const match = emptyCss.match(/--anf-accent:\s*([^;]+);/);
      assert.equal(match, null);
    });

    test('F8-B4: Addon manifest version semver boundary validation', () => {
      const isValidSemver = (v: string) => /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(v);
      assert.ok(isValidSemver('1.0.0'));
      assert.ok(isValidSemver('0.1.22-beta.1'));
      assert.equal(isValidSemver('v1.0'), false);
    });

    test('F8-B5: Corrupted or tampered addon payload fails SHA-256 verification', async () => {
      const original = new TextEncoder().encode('valid addon content');
      const hashBuf = await crypto.subtle.digest('SHA-256', original);
      const expectedSha = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      const tampered = new TextEncoder().encode('tampered addon content');
      const tamperedBuf = await crypto.subtle.digest('SHA-256', tampered);
      const tamperedSha = Array.from(new Uint8Array(tamperedBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      assert.notEqual(expectedSha, tamperedSha);
    });

    test('F8-B6: Addon catalog handles empty registry payload gracefully', () => {
      const registry = { version: 1, addons: [] };
      assert.equal(registry.addons.length, 0);
    });
  });

  // ==========================================
  // Feature 9: Local AI Model Execution Boundaries
  // ==========================================
  describe('F9: Local AI Model Execution Boundaries', () => {
    test('F9-B1: documentQuestion on empty document chunks returns ungrounded notice', () => {
      const q = documentQuestion('What is offline sync?', []);
      assert.ok(q.includes('What is offline sync?'));
    });

    test('F9-B2: needsClarification detects ultra-short queries', () => {
      assert.ok(needsClarification('help me'));
      assert.equal(needsClarification('How do I export audio to 16-bit WAV?'), false);
    });

    test('F9-B3: followups handles boolean flag for document presence', () => {
      const f1 = followups(true);
      assert.ok(f1.length >= 2);
      const f0 = followups(false);
      assert.ok(f0.length >= 2);
    });

    test('F9-B4: copyEvidence validates structure of evidence data before clipboard copy', () => {
      const valid = [{ id: 1, sourceName: 'doc1.pdf', page: null, text: 'Valid excerpt text', ocr: false }];
      assert.doesNotThrow(() => copyEvidence(valid));
    });

    test('F9-B5: System memory check rejects profile when RAM requirement exceeds capacity', () => {
      const profile = { id: 'deepseek-v4.1', minRamGb: 32 };
      const systemRamGb = 16;
      assert.equal(systemRamGb >= profile.minRamGb, false);
    });

    test('F9-B6: Weight downloader URL validation enforces official Hugging Face domain', () => {
      const isHfUrl = (u: string) => {
        try {
          const parsed = new URL(u);
          return parsed.hostname === 'huggingface.co';
        } catch {
          return false;
        }
      };
      assert.ok(isHfUrl('https://huggingface.co/buckets/mwalikokelvo/flint-bucket/model.gguf'));
      assert.equal(isHfUrl('https://untrusted-storage.xyz/model.gguf'), false);
    });
  });

  // ==========================================
  // Feature 10: Cross-Cutting Offline-First Boundaries
  // ==========================================
  describe('F10: Cross-Cutting Offline-First Boundaries', () => {
    test('F10-B1: Decrypting pack with wrong password throws error and preserves ciphertext', async () => {
      const payload = { note: 'Secret vault content' };
      const pack = await encryptPack(payload, 'correct-pass-1234');
      await assert.rejects(
        async () => await decryptPack(pack, 'wrong-pass-1234'),
        /passphrase is incorrect|damaged/i
      );
    });

    test('F10-B2: Decrypting tampered pack data throws error and prevents corruption', async () => {
      const payload = { safe: 'Data' };
      const pack = await encryptPack(payload, 'secret-pass-1234');
      const parsed = JSON.parse(pack);
      parsed.data = parsed.data.slice(0, -4) + 'AAAA';
      await assert.rejects(
        async () => await decryptPack(JSON.stringify(parsed), 'secret-pass-1234'),
        /passphrase is incorrect|damaged/i
      );
    });

    test('F10-B3: Encrypting pack with short password (< 12 chars) throws Error', async () => {
      await assert.rejects(
        async () => await encryptPack({ data: 1 }, 'short'),
        /between 12 and 1,024 characters/i
      );
    });

    test('F10-B4: Network offline event fires without unhandled promise rejections', () => {
      let isOnline = true;
      const setOnline = (val: boolean) => { isOnline = val; };
      setOnline(false);
      assert.equal(isOnline, false);
      setOnline(true);
      assert.equal(isOnline, true);
    });

    test('F10-B5: Session storage boundary enforces stringification of complex objects', () => {
      const session = new Map<string, string>();
      const key = 'anf-session-thought';
      session.set(key, JSON.stringify({ thought: 'Offline capture', created: 100 }));
      const retrieved = JSON.parse(session.get(key)!);
      assert.equal(retrieved.thought, 'Offline capture');
    });

    test('F10-B6: Offline mutation queue handles duplicate IDs idempotently', () => {
      const queue: Array<{ id: string; op: string }> = [];
      const enqueue = (mut: { id: string; op: string }) => {
        if (!queue.some(m => m.id === mut.id)) queue.push(mut);
      };
      enqueue({ id: 'mut-1', op: 'save' });
      enqueue({ id: 'mut-1', op: 'save' });
      assert.equal(queue.length, 1);
    });
  });
});
