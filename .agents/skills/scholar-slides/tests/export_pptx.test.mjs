// export_pptx integration tests (node --test tests/export_pptx.test.mjs).
// Round-3 review SS-03/SS-04: the default output path silently mismatched the
// benchmark's parity probe (parity never ran after a documented rebuild), and
// the summary counted collected equations instead of rasterized bitmaps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exportPptx } from "../scripts/export_pptx.mjs";

test("default output lands in <dir>/deck/deck.pptx (benchmark parity path)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-export-"));
  const deckJson = join(dir, "deck.json");
  writeFileSync(deckJson, JSON.stringify({ meta: { title: "t" }, slides: [] }));

  const r = await exportPptx(deckJson);

  assert.equal(r.out, join(dir, "deck", "deck.pptx"));
  assert.ok(existsSync(r.out), "the deck must actually be written");
});

test("nEquationsRasterized counts bitmaps actually written, not equations collected", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ss-export-"));
  const deckJson = join(dir, "deck.json");
  writeFileSync(deckJson, JSON.stringify({
    meta: { title: "t" },
    slides: [{ layout: "equation", action_title: "Loss", title: "Objective", equations: [{ latex: "L = 99.9" }] }],
  }));

  const r = await exportPptx(deckJson);

  const assets = join(dir, "pptx_assets");
  const written = existsSync(assets)
    ? readdirSync(assets).filter((f) => f.endsWith(".png")).length
    : 0;
  assert.equal(r.nEquationsRasterized, written);
});
