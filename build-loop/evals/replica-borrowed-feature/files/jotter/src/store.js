import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function storePath() {
  return process.env.JOTTER_FILE || join(homedir(), '.jotter.json');
}

export function loadNotes(path = storePath()) {
  if (!existsSync(path)) return [];
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return data.notes ?? [];
}

export function saveNotes(notes, path = storePath()) {
  writeFileSync(path, JSON.stringify({ notes }, null, 2));
}

export function addNote(text, path = storePath()) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Note text is required');
  const notes = loadNotes(path);
  const note = { id: randomUUID(), text: trimmed, createdAt: new Date().toISOString() };
  notes.push(note);
  saveNotes(notes, path);
  return note;
}
