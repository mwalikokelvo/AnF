#!/usr/bin/env node
import { addNote, loadNotes } from './store.js';
import { searchNotes } from './search.js';

function formatNote(note) {
  return `${note.createdAt.slice(0, 10)}  ${note.text}`;
}

export function run(argv, out = console.log) {
  const [command, ...rest] = argv;
  switch (command) {
    case 'add': {
      const note = addNote(rest.join(' '));
      out(`Added: ${note.text}`);
      return 0;
    }
    case 'list': {
      const notes = loadNotes();
      if (notes.length === 0) out('No notes yet. Add one with: jotter add <text>');
      notes.forEach((n) => out(formatNote(n)));
      return 0;
    }
    case 'search': {
      const results = searchNotes(loadNotes(), rest.join(' '));
      if (results.length === 0) out('No matching notes.');
      results.forEach((n) => out(formatNote(n)));
      return 0;
    }
    default:
      out('Usage: jotter <add|list|search> [text]');
      return command ? 1 : 0;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = run(process.argv.slice(2));
}
