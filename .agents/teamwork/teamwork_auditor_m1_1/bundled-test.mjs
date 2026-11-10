// <stdin>
import assert from "node:assert/strict";

// shared/audio/queue.ts
function previousTrack(ids, current, repeat) {
  if (!ids.length) return;
  const i = current ? ids.indexOf(current) : -1;
  if (i > 0) return ids[i - 1];
  if (i === 0) {
    if (repeat === "track") return current;
    if (repeat === "all") return ids[ids.length - 1];
    return void 0;
  }
  return ids[0];
}
function playPreviousTrack(ids, current, id) {
  const filtered = ids.filter((x) => x !== id);
  if (!current) return [id, ...filtered];
  const idx = filtered.indexOf(current);
  if (idx === -1) return [id, ...filtered];
  filtered.splice(idx, 0, id);
  return filtered;
}

// windows/src/workspace/lyrics-provider.ts
var titleCleanupPatterns = [
  /\s*\(.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit|with).*?\)/gi,
  /\s*\[.*?(official|video|audio|lyrics|lyric|visualizer|hd|hq|4k|remaster|remix|live|acoustic|version|edit|extended|radio|clean|explicit|with).*?\]/gi,
  /\s*【.*?】/g,
  /\s*\|.*$/g,
  /\s*-\s*(official|video|audio|lyrics|lyric|visualizer|live|remaster|remix|acoustic|version|edit).*$/gi,
  /\s*\(feat\..*?\)/gi,
  /\s*\(ft\..*?\)/gi,
  /\s*feat\..*$/gi,
  /\s*ft\..*$/gi
];
function cleanTitle(title) {
  let cleaned = title.trim();
  for (const pattern of titleCleanupPatterns) {
    cleaned = cleaned.replace(pattern, "");
  }
  while (/\s*[-–—]\s*$/.test(cleaned)) {
    cleaned = cleaned.replace(/\s*[-–—]\s*$/, "");
  }
  return cleaned.trim() || title.trim();
}
function primaryArtist(artist) {
  const trimmed = artist.trim();
  const parts = trimmed.split(/\s*(?:feat\.|ft\.|featuring|\bx\b|&|\band\b|\bwith\b|,|\/|;)\s*/i);
  return parts[0]?.trim() || trimmed;
}

// windows/src/workspace/podcast-feeds.ts
function parseDuration(value) {
  if (!value) return void 0;
  const clean = value.trim();
  if (!clean) return void 0;
  if (/^\d+(\.\d+)?$/.test(clean)) {
    const num = Math.round(Number(clean));
    return num >= 0 ? num : void 0;
  }
  const rawParts = clean.split(":");
  if (rawParts.length < 2 || rawParts.length > 3) return void 0;
  if (rawParts.some((p) => p.trim() === "" || !/^\d+(\.\d+)?$/.test(p.trim()))) return void 0;
  const parts = rawParts.map((p) => Number(p.trim()));
  return parts.reduce((total, part) => total * 60 + Math.round(part), 0);
}

// <stdin>
assert.equal(previousTrack(["t1"], "t1", "off"), void 0);
assert.equal(previousTrack(["t1"], "t1", "track"), "t1");
assert.equal(previousTrack(["t1"], "t1", "all"), "t1");
assert.equal(previousTrack([], "t1", "all"), void 0);
assert.equal(previousTrack(["t1", "t2"], "t99", "off"), "t1");
assert.deepEqual(playPreviousTrack(["a", "b"], "a", "x"), ["x", "a", "b"]);
assert.deepEqual(playPreviousTrack(["a", "b"], void 0, "x"), ["x", "a", "b"]);
assert.deepEqual(playPreviousTrack(["a", "b", "x"], "b", "x"), ["a", "x", "b"]);
assert.equal(cleanTitle("Song (Official 4k Video) [Extended Remix]"), "Song");
assert.equal(cleanTitle("Song - official live visualizer"), "Song");
assert.equal(cleanTitle("   "), "");
assert.equal(primaryArtist("Adele"), "Adele");
assert.equal(primaryArtist("Marshmello feat. Bastille"), "Marshmello");
assert.equal(primaryArtist("Kendrick Lamar, SZA"), "Kendrick Lamar");
assert.equal(primaryArtist("Drake / 21 Savage"), "Drake");
assert.equal(primaryArtist("Artist A; Artist B"), "Artist A");
console.log("Of Monsters and Men ->", primaryArtist("Of Monsters and Men"));
assert.equal(parseDuration("01:23:45"), 1 * 3600 + 23 * 60 + 45);
assert.equal(parseDuration("-100"), void 0);
assert.equal(parseDuration("foo:bar"), void 0);
assert.equal(parseDuration("99.9"), 100);
assert.equal(parseDuration(null), void 0);
assert.equal(parseDuration(void 0), void 0);
console.log("ALL ADVERSARIAL CHECKS PASSED EMPIRICALLY!");
