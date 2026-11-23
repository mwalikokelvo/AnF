export function searchNotes(notes, query) {
  const q = query.trim();
  if (!q) return notes;
  return notes.filter((note) => note.text.includes(q));
}
