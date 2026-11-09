import test from 'node:test';
import assert from 'node:assert/strict';
import { fromWire, restoreEitherHost, syncFailureKind, toWire, utf8Prefix } from '../../android/web/sync.ts';
import { restoreInPlace, restoreProjects } from '../../android/web/project-data.ts';
import { handOffLockScreen, lockScreenPlan, nativeBridgeId } from '../src/workspace/lock-screen.ts';
import type { Project } from '../../android/web/project-data.ts';

const syncId = 'a'.repeat(64);
const revision = 'b'.repeat(64);

function phoneProject(notes: Project['notes'], prompt = 'question'): Project {
  return {
    id: 'phone-id',
    name: 'Chat',
    draft: 'draft',
    prompt,
    notes,
    sources: [{ name: 'Book', text: 'Hello', pages: [{ number: 1, text: 'Page one', ocr: true }] }],
    updated: 5,
    sync: { id: syncId, title: 'Title', memory: 'remember this', model: 'fast' },
  };
}

test('phone roles and memory labels survive a Windows round trip', () => {
  const project = phoneProject([
    { role: 'You', text: 'hello' },
    { role: 'PC offline AI', text: 'local' },
    { role: 'Browser reply', text: 'pasted' },
  ]);
  const wire = toWire(project, true);
  assert.equal(wire.memory, 'remember this');
  assert.equal(wire.history[1].label, 'pc');
  assert.equal(wire.history[2].label, 'browser');
  assert.equal(wire.sources[0].pages[0].text, 'Page one');
  const back = fromWire({ project: wire, revision }, project, true, () => 'new-id');
  assert.deepEqual(back.notes.map(note => note.role), ['You', 'PC offline AI', 'Browser reply']);
  assert.deepEqual(back.notes.map(note => note.text), ['hello', 'local', 'pasted']);
  assert.equal(back.sources[0].pages?.[0].ocr, true);
  assert.equal(back.sync?.id, syncId);
});

test('a Windows assistant turn stays Assistant and a broken turn is refused', () => {
  const project = phoneProject([]);
  const back = fromWire({
    project: {
      id: syncId,
      name: 'Chat',
      title: 'Title',
      question: 'q',
      draft: 'd',
      history: [{ role: 'assistant', content: [{ text: 'from the PC' }] }],
      sources: [],
      memory: '',
      model: 'fast',
    },
    revision,
  }, project, false, () => 'new-id');
  assert.equal(back.notes[0].role, 'Assistant');
  assert.throws(() => fromWire({
    project: {
      id: syncId, name: 'Chat', title: 'Title', question: '', draft: '',
      history: [{ role: 'assistant', content: [] }],
      sources: [], memory: '', model: 'fast',
    },
    revision,
  }, project, false, () => 'new-id'), /Invalid conversation/);
});

test('one oversized conversation is skipped and a dropped link stops the sync', () => {
  assert.equal(syncFailureKind(Error('“Chat” has a question longer than Windows accepts (10,000 bytes).')), 'skip');
  assert.equal(syncFailureKind(Error('“Chat” exceeds Windows text limits. Export it and split it before syncing.')), 'skip');
  assert.equal(syncFailureKind(Error('Connection timed out.')), 'stop');
});

test('phone memory sent to Windows stays within 12,000 bytes', () => {
  const memory = 'é'.repeat(12000);
  const sent = utf8Prefix(memory, 12000);
  assert.ok(new TextEncoder().encode(sent).length <= 12000);
  assert.equal(sent, 'é'.repeat(6000));
  assert.equal(utf8Prefix('plain', 12000), 'plain');
});

test('file restore keeps OCR pages as a new copy, and snapshot restore keeps the sync identity', () => {
  const project = phoneProject([]);
  const copies = restoreProjects({ kind: 'coucou-mobile-backup', version: 1, projects: [project] }, () => 'copy-id');
  assert.equal(copies[0].id, 'copy-id');
  assert.equal(copies[0].sync, undefined);
  assert.equal(copies[0].sources[0].pages?.[0].text, 'Page one');
  const restored = restoreInPlace(project);
  assert.equal(restored.id, 'phone-id');
  assert.equal(restored.sync?.id, syncId);
  assert.equal(restored.sources[0].pages?.[0].ocr, true);
});

function windowsProject(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c'.repeat(64),
    name: 'Saved',
    title: 'Draft title',
    question: 'What happened?',
    draft: 'Private writing',
    history: [] as unknown[],
    sources: [{ name: 'Book', text: 'Hello', pages: [{ number: 1, text: 'Page one', ocr: true }], path: 'C:\\secret\\book.pdf' }],
    memory: 'remember this',
    model: 'fast',
    ...overrides,
  };
}

test('Android backup restores as a new copy with OCR pages and no sync identity', () => {
  const project = phoneProject([{ role: 'You', text: 'hello' }]);
  const copies = restoreEitherHost({ kind: 'coucou-mobile-backup', version: 1, projects: [project] }, () => 'copy-id');
  assert.equal(copies.length, 1);
  assert.equal(copies[0].id, 'copy-id');
  assert.equal(copies[0].sync, undefined);
  assert.equal(copies[0].prompt, 'question');
  assert.deepEqual(copies[0].notes, [{ role: 'You', text: 'hello' }]);
  assert.equal(copies[0].sources[0].pages?.[0].text, 'Page one');
  assert.equal(copies[0].sources[0].pages?.[0].ocr, true);
});

test('Windows backup history becomes phone notes and keeps pages on a new copy', () => {
  const windowsId = 'c'.repeat(64);
  const [project] = restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [windowsProject({
      id: windowsId,
      question: 'What happened?',
      history: [
        { role: 'user', content: [{ text: 'hello' }] },
        { role: 'assistant', content: [{ text: 'local' }], label: 'pc' },
        { role: 'assistant', content: [{ text: 'pasted' }], label: 'browser' },
        { role: 'assistant', content: [{ text: 'plain' }] },
      ],
    })],
  }, () => 'phone-new');
  assert.equal(project.id, 'phone-new');
  assert.notEqual(project.id, windowsId);
  assert.equal(project.name, 'Saved');
  assert.equal(project.draft, 'Private writing');
  assert.equal(project.prompt, 'What happened?');
  assert.deepEqual(project.notes, [
    { role: 'You', text: 'hello' },
    { role: 'PC offline AI', text: 'local' },
    { role: 'Browser reply', text: 'pasted' },
    { role: 'Assistant', text: 'plain' },
  ]);
  assert.deepEqual(project.sync, { id: windowsId, title: 'Draft title', memory: 'remember this', model: 'fast' });
  assert.deepEqual(project.sources[0].pages, [{ number: 1, text: 'Page one', ocr: true }]);
  assert.equal(Object.hasOwn(project.sources[0], 'path'), false);
});

test('Windows backup with no history restores an empty notes array', () => {
  const fields = {
    id: 'c'.repeat(64),
    name: 'Saved',
    title: 'Draft title',
    question: 'What happened?',
    draft: 'Private writing',
    sources: [],
    memory: 'remember this',
    model: 'fast',
  };
  const omitted = restoreEitherHost({ kind: 'coucou-windows-backup', version: 1, projects: [fields] }, () => 'phone-new');
  assert.deepEqual(omitted[0].notes, []);
  assert.equal(omitted[0].prompt, 'What happened?');
  const cleared = restoreEitherHost({ kind: 'coucou-windows-backup', version: 1, projects: [{ ...fields, history: null }] }, () => 'phone-new');
  assert.deepEqual(cleared[0].notes, []);
});

test('a Windows id that is not 64 hex characters is not stored on the phone project', () => {
  const [project] = restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [windowsProject({ id: 'old-id', history: [], sources: [] })],
  }, () => 'phone-new');
  assert.equal(project.id, 'phone-new');
  assert.equal(project.sync, undefined);
});

test('a 64-hex Windows id is stored only when title, memory, and model are present', () => {
  const id = 'd'.repeat(64);
  const [project] = restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [{ id, name: 'Saved', question: 'q', draft: 'd', history: [], sources: [] }],
  }, () => 'phone-new');
  assert.equal(project.id, 'phone-new');
  assert.equal(project.sync, undefined);
});

test('Windows backup rejects an unknown speaker role', () => {
  assert.throws(() => restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [windowsProject({ history: [{ role: 'system', content: [{ text: 'nope' }] }] })],
  }, () => 'phone-new'), Error);
});

test('Windows backup rejects an unknown speaker label', () => {
  assert.throws(() => restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [windowsProject({ history: [{ role: 'assistant', content: [{ text: 'nope' }], label: 'other' }] })],
  }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({
    kind: 'coucou-windows-backup',
    version: 1,
    projects: [windowsProject({ history: [{ role: 'assistant', content: [{ text: 'nope' }], label: '' }] })],
  }, () => 'phone-new'), Error);
});

test('restoreEitherHost rejects a backup that is not a phone or Windows export', () => {
  assert.throws(() => restoreEitherHost(null, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ hello: 'world' }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ kind: 'other-app', version: 1, projects: [] }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ kind: 'coucou-windows-backup', version: 1 }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ kind: 'coucou-windows-backup', version: 1, projects: 'nope' }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ kind: 'coucou-windows-backup', version: 2, projects: [] }, () => 'phone-new'), Error);
  assert.throws(() => restoreEitherHost({ kind: 'coucou-mobile-backup', version: 1 }, () => 'phone-new'), Error);
});

test('lock-screen request ids fit the Android bridge', () => {
  assert.equal(nativeBridgeId(1), '1');
  assert.match(nativeBridgeId(Date.now()), /^[0-9]{1,12}$/);
  assert.equal(lockScreenPlan({ id: 'track-1', name: 'song.mp3', streamUrl: 'https://cdn.example/a.mp3', blobSize: 20 }).kind, 'remote');
  assert.equal(lockScreenPlan({ id: 'track-1', name: 'song.mp3', streamUrl: 'http://cdn.example/a.mp3', blobSize: 20 }).kind, 'stay');
  assert.equal(lockScreenPlan({ id: 'track-1', name: 'song.mp3', blobSize: 1000 }).kind, 'file');
  assert.equal(lockScreenPlan({ id: 'podcast:ep', name: 'ep.mp3', blobSize: 1000 }).kind, 'stay');
  assert.equal(lockScreenPlan({ id: 'track-1', name: 'song.mp3', blobSize: 16_000_001 }).kind, 'stay');
});

test('lock-screen handoff loads an https stream and does not press play on an empty player', async () => {
  const ops: string[] = [];
  const message = await handOffLockScreen(
    { id: 'track-1', name: 'song.mp3', title: 'Song', artist: 'Artist', album: 'Album', streamUrl: 'https://cdn.example/a.mp3', blobSize: 20 },
    12,
    async (op, data) => { ops.push(op + ':' + JSON.stringify(data)); },
  );
  assert.equal(message, 'Handed to the Android player.');
  assert.deepEqual(ops, ['play_remote:{"url":"https://cdn.example/a.mp3","title":"Song","artist":"Artist","album":"Album","position":12}']);
});
