import test from 'node:test';
import assert from 'node:assert/strict';
import { JevIndex, type IndexedDocument } from '../src/workspace/jev-index.js';

test('Jev-Ultrafast & Agent-Reach Search Engine', async (t) => {
  await t.test('tokenize normalizes case, diacritics and removes stopwords', () => {
    const idx = new JevIndex();
    const tokens = idx.tokenize('The café in Zürich produces café-crème!');
    assert.deepEqual(tokens, ['cafe', 'zurich', 'produces', 'cafe-creme']);
  });

  await t.test('indexes documents and ranks results with BM25', () => {
    const idx = new JevIndex();

    idx.addDocument({
      id: 'doc-1',
      corpus: 'notes',
      title: 'Web Audio DSP Equalizer Architecture',
      content: 'This note covers the 5-band biquad filter equalisation and gain parameter automation in Web Audio.',
    });

    idx.addDocument({
      id: 'doc-2',
      corpus: 'notes',
      title: 'DigitalOcean Spaces Backup Strategy',
      content: 'Configuring remote cloud backups using S3-compatible Spaces bucket storage and rclone.',
    });

    idx.addDocument({
      id: 'doc-3',
      corpus: 'transcripts',
      title: 'Podcast Episode 42: Audio Engineering',
      content: 'Interview with a senior DSP engineer about real-time Web Audio equalization and filtering algorithms.',
    });

    assert.equal(idx.documentCount, 3);

    // Search for "audio equalizer"
    const results = idx.search('audio equalizer');
    assert.ok(results.length >= 2);
    // doc-1 and doc-3 should be top results
    assert.ok(results[0].docId === 'doc-1' || results[0].docId === 'doc-3');
    assert.ok(results[0].score > 0);
    assert.ok(results.some(r => r.snippet.toLowerCase().includes('audio') || r.snippet.toLowerCase().includes('equaliz')));
  });

  await t.test('filters search by target corpus', () => {
    const idx = new JevIndex();

    idx.addDocument({
      id: 'note-1',
      corpus: 'notes',
      title: 'AES-GCM Encryption',
      content: 'Local vault encryption with PBKDF2 and AES-256-GCM.',
    });

    idx.addDocument({
      id: 'transcript-1',
      corpus: 'transcripts',
      title: 'Security Podcast',
      content: 'Discussion on AES-GCM encryption performance.',
    });

    const noteOnly = idx.search('AES-GCM encryption', { corpus: 'notes' });
    assert.equal(noteOnly.length, 1);
    assert.equal(noteOnly[0].docId, 'note-1');

    const transcriptOnly = idx.search('AES-GCM encryption', { corpus: 'transcripts' });
    assert.equal(transcriptOnly.length, 1);
    assert.equal(transcriptOnly[0].docId, 'transcript-1');
  });

  await t.test('updates and removes documents cleanly', () => {
    const idx = new JevIndex();

    const doc: IndexedDocument = {
      id: 'temp-1',
      corpus: 'tasks',
      title: 'Refactor DSP',
      content: 'Fix the crossfade gain ramp timing.',
    };

    idx.addDocument(doc);
    assert.equal(idx.documentCount, 1);

    const hit = idx.search('crossfade');
    assert.equal(hit.length, 1);

    idx.removeDocument('temp-1');
    assert.equal(idx.documentCount, 0);

    const afterRemove = idx.search('crossfade');
    assert.equal(afterRemove.length, 0);
  });

  await t.test('serializes and deserializes index preserving search results', () => {
    const original = new JevIndex();
    original.addDocument({
      id: 'doc-alpha',
      corpus: 'articles',
      title: 'Substack Newsletter Strategy',
      content: 'Frontmatter authoring and RSS 2.0 XML distribution.',
    });

    const json = original.serialize();
    const restored = JevIndex.deserialize(json);

    assert.equal(restored.documentCount, 1);
    const results = restored.search('Substack newsletter');
    assert.equal(results.length, 1);
    assert.equal(results[0].docId, 'doc-alpha');
  });
});
