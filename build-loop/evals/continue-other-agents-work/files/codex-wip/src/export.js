export function notesToCsv(notes) {
  const lines = ['created,text,id'];
  for (const n of notes) lines.push([n.createdAt, n.text, n.id].join(','));
  return lines.join('\n') + '\n';
}
