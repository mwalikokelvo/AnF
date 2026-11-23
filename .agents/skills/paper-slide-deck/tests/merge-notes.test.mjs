// findSlideImages prompt pairing (node --test tests/merge-notes.test.mjs).
// Round-3 review PSD-10: the generator accepts *.md AND *.txt prompts, but the
// merge step paired only `<base>.md` — a .txt prompt's speaker notes silently
// vanished from the PPTX.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { findSlideImages } = await import("../scripts/merge-to-pptx.ts");

function deckWith(prompts) {
  const dir = mkdtempSync(join(tmpdir(), "psd-notes-"));
  mkdirSync(join(dir, "prompts"));
  for (const base of ["01-slide-cover", "02-slide-intro", "03-slide-results"]) {
    writeFileSync(join(dir, `${base}.png`), Buffer.alloc(8));
  }
  for (const [name, content] of Object.entries(prompts)) {
    writeFileSync(join(dir, "prompts", name), content);
  }
  return dir;
}

test("a .txt prompt pairs into promptPath (md wins when both exist)", () => {
  const dir = deckWith({
    "01-slide-cover.md": "md notes",
    "02-slide-intro.txt": "txt notes",
  });
  const slides = findSlideImages(dir).sort((a, b) => a.index - b.index);
  const byName = Object.fromEntries(slides.map((s) => [s.filename.replace(/\.png$/, ""), s]));

  assert.ok(byName["01-slide-cover"].promptPath?.endsWith(".md"));
  assert.ok(byName["02-slide-intro"].promptPath?.endsWith(".txt"),
    "a bare .txt prompt must still pair into the notes");
  assert.equal(byName["03-slide-results"].promptPath, undefined);
});
