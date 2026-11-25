// createPdf end-to-end under plain node (node --test tests/merge-pdf.test.mjs).
// Round-3 review PSD-01: createPdf ended with `await Bun.write(...)`, the only
// bun-only API in scripts/ — under node the merge crashed AFTER embedding every
// image ("Bun is not defined", exit 1, no PDF). This test runs the real merge
// so a bun-ism cannot slip back in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { createPdf } = await import("../scripts/merge-to-pdf.ts");
const { PDFDocument } = await import("../scripts/node_modules/pdf-lib/dist/pdf-lib.esm.js");

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

test("createPdf writes the PDF under plain node (no Bun.write)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "psd-pdf-"));
  const pngPath = join(dir, "01-slide-cover.png");
  writeFileSync(pngPath, PNG);
  const outPath = join(dir, "deck.pdf");

  await createPdf(PDFDocument, [{ filename: "01-slide-cover.png", path: pngPath }], outPath);

  const bytes = readFileSync(outPath);
  assert.ok(bytes.length > 100, "a real PDF should be on disk");
  assert.equal(bytes.subarray(0, 5).toString("latin1"), "%PDF-", "file must be a PDF");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
});
