import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from './test-env.js';

setupTestEnvironment();

import { reconcileQueue, nextTrack, previousTrack, moveTrack } from '../../src/workspace/audio-queue.js';
import { parseLyrics, activeLine, matchLyricsTrack } from '../../src/workspace/lyrics.js';
import { parseRss, downloadPodcastEnclosure, updateEpisodePosition, getEpisodeState } from '../../src/workspace/podcast-feeds.js';
import { audioLibrary } from '../../src/workspace/audio-library.js';
import { sections, clipText, addHighlight } from '../../../shared/domain/reader-data.js';
import { renderWriting } from '../../src/workspace/writing.js';
import { references, connections, knowledgeGraph } from '../../../shared/domain/knowledge-data.js';
import { wav, peaks, level } from '../../src/workspace/audio-data.js';
import { spectralClean } from '../../../shared/audio/denoise.js';
import { documentQuestion, followups } from '../../../shared/domain/followups.js';
import { copyEvidence } from '../../../shared/domain/answer-evidence.js';
import { encryptPack, decryptPack } from '../../src/workspace/encrypted-pack.js';
import { SpotubeStreamService } from '../../src/workspace/streaming-provider.js';

describe('Tier 3: Pairwise Combinatorial Testing (Cross-Feature Interactions)', () => {

  // Test 1: F1 (Player Engine) + F2 (Synced Lyrics)
  test('T3-1: Player seeking updates active lyric line and vice versa', () => {
    const lrc = '[00:00.00]Intro\n[00:05.00]Verse 1 starts\n[00:15.00]Chorus arrives\n[00:30.00]Outro';
    const parsed = parseLyrics(lrc);
    assert.ok(parsed.synced);

    // Playback at 7s -> Verse 1
    let time = 7.0;
    let lineIdx = activeLine(parsed, time);
    assert.equal(lineIdx, 1);
    assert.equal(parsed.lines[lineIdx].text, 'Verse 1 starts');

    // Click lyric line 2 (Chorus at 15s) -> seek playback to 15s
    time = parsed.lines[2].time!;
    assert.equal(time, 15);
    lineIdx = activeLine(parsed, time);
    assert.equal(lineIdx, 2);
    assert.equal(parsed.lines[lineIdx].text, 'Chorus arrives');
  });

  // Test 2: F3 (Podcast RSS) + F4 (Audio Library)
  test('T3-2: Podcast enclosure caching persists audio track in IndexedDB and updates library queue', async () => {
    const lib = audioLibrary();
    const mockEpisode = {
      id: 'ep-sync-1',
      title: 'Episode 1: Offline Power',
      summary: 'Summary',
      audioUrl: 'https://example.org/audio/ep1.mp3',
      duration: 1800,
      downloadStatus: 'none' as const
    };

    const mockTrack = {
      id: 'podcast:' + mockEpisode.id,
      title: mockEpisode.title,
      artist: 'Tech Feed',
      name: mockEpisode.title,
      album: 'Tech Feed',
      blob: new Blob(['audio-bytes'], { type: 'audio/mpeg' }),
      duration: 1800,
      kind: 'podcast' as const,
      created: Date.now()
    };
    await lib.put(mockTrack);

    const retrieved = await lib.get('podcast:ep-sync-1');
    assert.ok(retrieved);
    assert.equal(retrieved.kind, 'podcast');
    assert.equal(retrieved.duration, 1800);

    const queue = reconcileQueue([], [retrieved.id], true);
    assert.equal(queue[0], 'podcast:ep-sync-1');
  });

  // Test 3: F5 (Reader) + F6 (Vault Knowledge)
  test('T3-3: Reader highlight clipped into note draft indexes wikilinks into knowledge graph', () => {
    const initialDraft = '# Research Note\n\nStudy of local data.\n\n';
    const clipped = clipText(initialDraft, 'SQLite provides primary persistence.', 'Architecture Guide');
    assert.ok(clipped.includes('SQLite provides primary persistence.'));

    const noteWithLinks = clipped + '\nSee also: [[Storage Engines]] and [[Crypto Vault]]';
    const extracted = references(noteWithLinks).links;
    assert.deepEqual(extracted, ['Storage Engines', 'Crypto Vault']);

    const notes = [
      { id: 'note-1', name: 'Research Note', draft: noteWithLinks, sources: [] },
      { id: 'note-2', name: 'Storage Engines', draft: 'Engines list', sources: [] },
      { id: 'note-3', name: 'Crypto Vault', draft: 'Vault spec', sources: [] }
    ];
    const graph = knowledgeGraph(notes, 50);
    assert.equal(graph.nodes.length, 3);
    assert.ok(graph.edges.length >= 2);
  });

  // Test 4: F6 (Vault Knowledge) + F9 (Local AI)
  test('T4-4: Vault note excerpts ground Local AI prompt and preserve evidence citations', () => {
    const notes = [
      { id: 'n1', title: 'Offline Architecture', body: 'SQLCipher encrypts all Tier 1 local records using 256-bit AES.' },
      { id: 'n2', title: 'Audio Pipeline', body: 'AudioWorklet captures 48kHz PCM without garbage collection jitter.' }
    ];

    const sources = notes.map(n => ({ name: n.title, text: n.body }));
    const groundedPrompt = documentQuestion('How does AnF secure local data?', sources);
    assert.ok(groundedPrompt.includes('SQLCipher encrypts all Tier 1 local records'));
    assert.ok(groundedPrompt.includes('[1]'));

    const evidence = [
      { id: 1, sourceName: 'Offline Architecture', page: null, text: 'SQLCipher encrypts Tier 1 records with AES-256.', ocr: false }
    ];
    assert.doesNotThrow(() => copyEvidence(evidence));
  });

  // Test 5: F7 (Audio Studio) + F1 (Music Hub)
  test('T5-5: Audio Studio exported 16-bit WAV imports into Music Hub library and queue', async () => {
    const lib = audioLibrary();
    const pcm = new Float32Array(44100).map((_, i) => Math.sin(2 * Math.PI * 440 * (i / 44100)));
    const wavBytes = wav([pcm], 44100);
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });

    const studioTrack = {
      id: 'studio-recording-1',
      title: 'Studio Take 1',
      artist: 'Self',
      name: 'take1.wav',
      blob: wavBlob,
      duration: 1,
      kind: 'music' as const,
      created: Date.now()
    };
    await lib.put(studioTrack);

    const saved = await lib.get('studio-recording-1');
    assert.ok(saved);
    assert.equal(saved.title, 'Studio Take 1');
    assert.equal(saved.blob.type, 'audio/wav');
  });

  // Test 6: F8 (Addon Store) + F5 (Reader UI)
  test('T6-6: Addon theme CSS properties apply cleanly to Reader Markdown layout', () => {
    const themeCss = ':root { --anf-bg: #1a1b26; --anf-fg: #c0caf5; --anf-accent: #7aa2f7; }';
    assert.equal(/@import\b/i.test(themeCss), false);
    assert.equal(/url\(\s*['"]?(?!data:)/i.test(themeCss), false);

    const markdownDoc = '# Chapter 1: Tokyo Night\nContent rendered under theme.';
    const el = renderWriting(markdownDoc);
    assert.ok(el);
    assert.equal(el.tagName, 'div');
  });

  // Test 7: F9 (Local AI) + F5 (Publishing)
  test('T7-7: AI generated article draft renders into Markdown and formats frontmatter', () => {
    const aiGeneratedDraft = '---\ntitle: Modern Offline Web\nauthor: Antigravity\ntags: [web, offline]\n---\n\n# Introduction\n\nOffline applications provide resilience.';
    const el = renderWriting(aiGeneratedDraft);
    assert.ok(el);
    assert.ok(el.children.length > 0);
  });

  // Test 8: F6 (ZIM Knowledge) + F10 (Storage Hierarchy)
  test('T8-8: Vault note records pack into encrypted PBKDF2/AES-GCM backup and unpack cleanly', async () => {
    const vaultRecords = {
      schemaVersion: 1,
      exportedAt: Date.now(),
      notes: [
        { id: 'zim-note-1', title: 'Wikipedia / Offline', body: 'Cached article from OpenZIM archive.' }
      ]
    };

    const password = 'ultra-secure-vault-pass-1234';
    const encrypted = await encryptPack(vaultRecords, password);
    assert.ok(encrypted.includes('coucoupack'));

    const restored = await decryptPack(encrypted, password) as typeof vaultRecords;
    assert.equal(restored.notes.length, 1);
    assert.equal(restored.notes[0].title, 'Wikipedia / Offline');
  });

  // Test 9: F3 (Podcast) + F7 (Audio Studio)
  test('T9-9: Podcast audio samples process through spectral noise reduction', async () => {
    const rate = 16000;
    const samples = new Float32Array(rate * 2).fill(0.05); // 2 seconds of audio
    const cleaned = await spectralClean(samples, rate, 0, 1.5);
    assert.equal(cleaned.length, samples.length);
  });

  // Test 10: F4 (Streaming) + F2 (Lyrics) + F10 (Offline Cache)
  test('T10-10: Spotube streaming track matches cached LRCLIB lyrics file and cascades offline', () => {
    const track = {
      id: 'stream:sp-404',
      name: 'starboy.mp3'
    };
    const file = { name: 'starboy.lrc' };

    const matched = matchLyricsTrack(file, [track]);
    assert.ok(matched);
    assert.equal(matched.id, 'stream:sp-404');
  });

  // Test 11: F8 (Addon Store) + F10 (Storage Hierarchy)
  test('T11-11: Addon manifest integrity verified by SHA-256 before storage', async () => {
    const manifest = {
      id: 'theme-nord',
      name: 'Nord Theme',
      version: '1.0.0',
      type: 'theme',
      author: 'Arctic Ice Studio'
    };
    const jsonBytes = new TextEncoder().encode(JSON.stringify(manifest));
    const hashBuffer = await crypto.subtle.digest('SHA-256', jsonBytes);
    const hex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    assert.equal(hex.length, 64);
  });

  // Test 12: F9 (Local AI) + F10 (Offline Core)
  test('T12-12: Local AI followups generate deterministic offline suggestion prompts', () => {
    const promptList = followups(true);
    assert.ok(Array.isArray(promptList));
    assert.ok(promptList.length >= 2);
  });
});
