import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupTestEnvironment } from './test-env.js';

setupTestEnvironment();

import { reconcileQueue, nextTrack, previousTrack, moveTrack, shuffled } from '../../src/workspace/audio-queue.js';
import { parseLyrics, activeLine } from '../../src/workspace/lyrics.js';
import { durationText, peaks, level, wav } from '../../src/workspace/audio-data.js';
import { audioLibrary } from '../../src/workspace/audio-library.js';
import { parseRss, substackFeedUrl, saveFeeds, loadFeeds, updateEpisodePosition, getEpisodeState } from '../../src/workspace/podcast-feeds.js';
import { sections, readingState, addHighlight, clipText, sectionIndex } from '../../../shared/domain/reader-data.js';
import { renderWriting } from '../../src/workspace/writing.js';
import { references, matchesNote, connections, tagTree, knowledgeGraph } from '../../../shared/domain/knowledge-data.js';
import { spectralClean } from '../../../shared/audio/denoise.js';
import { encryptPack, decryptPack } from '../../src/workspace/encrypted-pack.js';
import { documentQuestion, followups, needsClarification } from '../../../shared/domain/followups.js';
import { copyEvidence } from '../../../shared/domain/answer-evidence.js';

describe('Tier 4: Real-World Workload Testing (Comprehensive User Journeys)', () => {

  // Scenario 1: Complete Music Listening Journey
  test('Scenario 1: Multi-track queue lifecycle with LRCLIB synchronized lyrics and state persistence', async () => {
    const lib = audioLibrary();

    // 1. User has 3 tracks in library
    const track1 = {
      id: 't-1',
      title: 'Midnight City',
      artist: 'M83',
      name: 'midnight.mp3',
      album: 'Hurry Up, We\'re Dreaming',
      blob: new Blob(['audio-1'], { type: 'audio/mpeg' }),
      duration: 243,
      created: 1000
    };
    const track2 = {
      id: 't-2',
      title: 'Reunion',
      artist: 'M83',
      name: 'reunion.mp3',
      album: 'Hurry Up, We\'re Dreaming',
      blob: new Blob(['audio-2'], { type: 'audio/mpeg' }),
      duration: 235,
      created: 2000
    };
    const track3 = {
      id: 't-3',
      title: 'Wait',
      artist: 'M83',
      name: 'wait.mp3',
      album: 'Hurry Up, We\'re Dreaming',
      blob: new Blob(['audio-3'], { type: 'audio/mpeg' }),
      duration: 343,
      created: 3000
    };

    await lib.put(track1);
    await lib.put(track2);
    await lib.put(track3);

    // 2. Build initial queue and shuffle
    const queue = reconcileQueue([], ['t-1', 't-2', 't-3'], true);
    assert.deepEqual(queue, ['t-1', 't-2', 't-3']);

    const randomFn = () => 0.5;
    const shuffledQ = shuffled(queue, randomFn);
    assert.equal(shuffledQ.length, 3);

    // 3. Play track-1 and attach synchronized lyrics
    const lrc = '[00:00.00]Instrumental intro\n[00:15.00]City is my church\n[00:30.00]It wraps me in the blinding twilight\n[01:00.00]Waiting in a car';
    const lyrics = parseLyrics(lrc);
    assert.equal(lyrics.synced, true);

    // 4. Scrub and track active lyric line
    assert.equal(activeLine(lyrics, 10), 0);
    assert.equal(activeLine(lyrics, 20), 1);
    assert.equal(activeLine(lyrics, 45), 2);

    // 5. Transition to next track with repeat 'all'
    const nextId = nextTrack(queue, 't-3', 'all', false);
    assert.equal(nextId, 't-1');

    // 6. Save listening state to library
    await lib.save({
      id: 'queue',
      order: queue,
      current: 't-1',
      repeat: 'all',
      position: 45.2
    });

    const savedState = await lib.state();
    assert.equal(savedState.current, 't-1');
    assert.equal(savedState.repeat, 'all');
    assert.equal(savedState.position, 45.2);
  });

  // Scenario 2: Research and Knowledge Synthesis
  test('Scenario 2: Long-form reading, multi-color highlighting, and wikilink knowledge graph', () => {
    // 1. User loads long-form essay
    const essay = '# The Future of Offline Computing\n' +
      'Offline-first architecture is not merely about surviving network disconnections.\n\n' +
      'It represents an inversion of authority, prioritizing the user local storage.\n\n' +
      '# Architectural Principles\n' +
      'Every interaction must resolve against a local replica.\n\n' +
      'Synchronizations are opportunistic and non-blocking.';

    const parts = sections(essay);
    assert.ok(parts.length >= 1);

    // 2. User adds highlights across sections
    let state = { offset: 0, bookmarks: [], annotations: [] };
    const quote1 = 'Offline-first architecture is not merely about surviving network disconnections.';
    const q1Start = essay.indexOf(quote1);
    state = addHighlight(state, essay, q1Start, q1Start + quote1.length, 'gold', 'Key thesis statement', 'hl-1');

    const quote2 = 'Every interaction must resolve against a local replica.';
    const q2Start = essay.indexOf(quote2);
    state = addHighlight(state, essay, q2Start, q2Start + quote2.length, 'green', 'Core design axiom', 'hl-2');

    assert.equal(state.annotations.length, 2);
    assert.equal(state.annotations[0].color, 'gold');
    assert.equal(state.annotations[1].color, 'green');

    // 3. User clips quote to new note draft with wikilinks
    let draft = clipText('# Offline Synthesis\n\nNotes from article:\n\n', quote1, 'The Future of Offline Computing');
    draft += '\n\nRelated to: [[Local First Manifesto]] and [[CRDT Protocols]]';

    const links = references(draft).links;
    assert.deepEqual(links, ['Local First Manifesto', 'CRDT Protocols']);

    // 4. Construct bi-directional knowledge graph
    const notes = [
      { id: 'n-synthesis', name: 'Offline Synthesis', draft, sources: [] },
      { id: 'n-manifesto', name: 'Local First Manifesto', draft: 'Foundational paper on local-first.', sources: [] },
      { id: 'n-crdt', name: 'CRDT Protocols', draft: 'Conflict-free replicated data types.', sources: [] }
    ];

    const graph = knowledgeGraph(notes, 10);
    assert.equal(graph.nodes.length, 3);
    const conn = connections(notes);
    assert.equal(conn.length, 2);
  });

  // Scenario 3: Podcast Ingestion to Audio Studio Production
  test('Scenario 3: Podcast RSS subscription, playback position tracking, and audio waveform export', () => {
    // 1. Ingest RSS podcast feed
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Audio Engineering Podcast</title>
        <item>
          <guid>ep-101</guid>
          <title>Mastering Waveform Audio</title>
          <description><![CDATA[<p>Deep dive into PCM and AudioWorklet processing.</p>]]></description>
          <enclosure url="https://example.org/audio/101.mp3" length="32000000" type="audio/mpeg"/>
          <itunes:duration>30:00</itunes:duration>
          <pubDate>Fri, 30 Oct 2026 10:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

    const feed = parseRss(xml, 'https://example.org/feed');
    assert.equal(feed.title, 'Audio Engineering Podcast');
    assert.equal(feed.episodes.length, 1);

    // 2. Play podcast and track position
    const ep = feed.episodes[0];
    updateEpisodePosition(ep.id, 615.4);
    const state = getEpisodeState(ep.id);
    assert.equal(state.position, 615.4);

    // 3. User records voice snippet in Audio Studio (1000 PCM samples)
    const voiceSamples = new Float32Array(1000).map((_, i) => Math.sin(i / 10) * 0.8);
    const lev = level([voiceSamples]);
    assert.ok(lev.peak > 0.5);

    // 4. Downsample to 20 waveform visual peaks
    const visualPeaks = peaks([voiceSamples], 20);
    assert.equal(visualPeaks.length, 20);

    // 5. Export to 16-bit RIFF WAV blob
    const wavBytes = wav([voiceSamples], 48000);
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    assert.equal(wavBlob.type, 'audio/wav');
    assert.equal(wavBlob.size, 44 + 1000 * 2);
  });

  // Scenario 4: Encrypted Vault Migration & Recovery
  test('Scenario 4: Vault database pack encryption with PBKDF2/AES-GCM and full recovery', async () => {
    // 1. Prepare vault snapshot
    const vault = {
      version: 2,
      createdAt: 1730300000000,
      notes: [
        { id: 'note-secret-1', title: 'Private Ledger', body: 'Encrypted balances and transaction hashes.' },
        { id: 'note-secret-2', title: 'Passphrases', body: 'Key derivation constants.' }
      ]
    };

    // 2. Encrypt package with master passphrase (>= 12 chars)
    const passphrase = 'correct-horse-battery-staple-789';
    const pack = await encryptPack(vault, passphrase);

    const parsed = JSON.parse(pack);
    assert.ok(parsed.salt.length >= 16);
    assert.ok(parsed.iv.length >= 12);
    assert.ok(parsed.data.length > 50);

    // 3. Unpack and recover vault records
    const recovered = await decryptPack(pack, passphrase) as typeof vault;
    assert.equal(recovered.version, 2);
    assert.equal(recovered.notes.length, 2);
    assert.equal(recovered.notes[0].title, 'Private Ledger');
    assert.equal(recovered.notes[1].title, 'Passphrases');
  });

  // Scenario 5: Offline Marketplace & Grounded Local AI
  test('Scenario 5: Addon verification, offline AI prompt grounding, and evidence tracking', async () => {
    // 1. Inspect addon manifest and compute SHA-256
    const manifest = {
      id: 'theme-dracula',
      name: 'Dracula Theme',
      version: '1.2.0',
      type: 'theme',
      entry: 'dracula.css'
    };
    const manifestData = new TextEncoder().encode(JSON.stringify(manifest));
    const digest = await crypto.subtle.digest('SHA-256', manifestData);
    const sha = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    assert.equal(sha.length, 64);

    // 2. Ground user query using offline vault excerpts
    const query = 'What encryption cipher is used by AnF vault?';
    const excerpts = [
      { name: 'chunk-1', text: 'AnF uses SQLCipher with AES-256-GCM for all Tier 1 local databases.' },
      { name: 'chunk-2', text: 'Backup packs use PBKDF2 key derivation with 100,000 iterations.' }
    ];

    const prompt = documentQuestion(query, excerpts);
    assert.ok(prompt.includes('What encryption cipher is used by AnF vault?'));
    assert.ok(prompt.includes('AES-256-GCM'));

    // 3. Verify clarification heuristic does not trigger on specific technical question
    assert.equal(needsClarification(query), false);

    // 4. Record evidence citation
    const evidence = [
      { id: 1, sourceName: 'chunk-1', page: null, text: 'SQLCipher with AES-256-GCM and PBKDF2.', ocr: false }
    ];
    assert.doesNotThrow(() => copyEvidence(evidence));
  });

  // Scenario 6: Multi-format Substack Publishing Pipeline
  test('Scenario 6: Frontmatter drafting, live Markdown rendering, and publishing metadata', () => {
    // 1. Author article draft with YAML frontmatter
    const markdownContent = `---
title: The Architecture of Local-First Applications
subtitle: Designing for privacy, speed, and offline resilience
author: Engineering Team
slug: architecture-of-local-first
tags: [architecture, offline, engineering]
published: 2026-10-31
---

# Executive Summary

Modern software applications are increasingly vulnerable to network degradation and central cloud outages.

## Key Architectural Tenets

1. **Local Data Primacy**: All state mutations write immediately to local SQLCipher databases.
2. **Deterministic Queueing**: Outgoing sync mutations are enqueued and idempotently processed.
3. **Audio Streaming & Studio**: Media playback and live microphone recordings work seamlessly offline.

### Summary Checklist

- [x] Full offline capability
- [x] Zero-telemetry guarantees
- [x] Cross-platform Windows and Android parity
`;

    // 2. Live Markdown editor rendering
    const rendered = renderWriting(markdownContent);
    assert.ok(rendered);
    assert.equal(rendered.tagName, 'div');
    assert.ok(rendered.children.length > 0);

    // 3. Estimate reading metrics (word count, reading time)
    const words = markdownContent.split(/\s+/).filter(w => w.length > 0);
    const readingMinutes = Math.max(1, Math.ceil(words.length / 200));
    assert.ok(words.length >= 50);
    assert.equal(readingMinutes, 1);
  });
});
