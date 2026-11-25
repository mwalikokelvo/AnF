// Proofread gate tests (node --test tests/proofread.test.mjs): an AI-generated slide recorded in
// generated.json cannot be merged until proofread.json carries a disposition bound to its bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { proofreadGate, markProofread, recordGenerated, sha256File } = await import("../scripts/proofread.ts");
const pptx = await import("../scripts/merge-to-pptx.ts");
const pdf = await import("../scripts/merge-to-pdf.ts");

// 1x1 PNGs with different bytes (the second has a different pixel)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);
const PNG2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
  "base64"
);

// An extracted figure has its own bytes (slides are identified by content hash).
const FIGURE = Buffer.concat([PNG, Buffer.from("extracted-figure-trailer")]);

function deck({ generated = ["02-slide-method.png"], proofread } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "psd-proof-"));
  writeFileSync(join(dir, "01-slide-figure.png"), FIGURE); // extracted figure: never in generated.json
  writeFileSync(join(dir, "02-slide-method.png"), PNG);
  if (generated) {
    const slides = Object.fromEntries(generated.map((f) => [f, { sha256: sha256File(join(dir, f)) }]));
    writeFileSync(join(dir, "generated.json"), JSON.stringify({ slides }));
  }
  if (proofread) writeFileSync(join(dir, "proofread.json"), JSON.stringify({ slides: proofread(dir) }));
  return dir;
}
const slidesOf = (dir) => ["01-slide-figure.png", "02-slide-method.png"].map((f) => ({ filename: f, path: join(dir, f) }));

test("an unproofread generated slide is fatal and named; the extracted slide is not", () => {
  const dir = deck();
  const { fatal, warnings } = proofreadGate(dir, slidesOf(dir));
  assert.equal(fatal.length, 1);
  assert.match(fatal[0], /02-slide-method\.png \(no proofread disposition\)/);
  assert.doesNotMatch(fatal[0], /01-slide-figure/);
  assert.deepEqual(warnings, []);
});

test("--allow-unproofread turns the refusal into a warning", () => {
  const dir = deck();
  const { fatal, warnings } = proofreadGate(dir, slidesOf(dir), { allowUnproofread: true });
  assert.deepEqual(fatal, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /02-slide-method\.png/);
});

test("an ok disposition on the same bytes passes", () => {
  const dir = deck();
  markProofread(dir, "02-slide-method.png", "ok");
  assert.deepEqual(proofreadGate(dir, slidesOf(dir)), { fatal: [], warnings: [], checks: [] });
});

test("a slide changed after proofreading is unproofread again", () => {
  const dir = deck();
  markProofread(dir, "02-slide-method.png", "ok");
  writeFileSync(join(dir, "02-slide-method.png"), PNG2); // regenerated
  const { fatal } = proofreadGate(dir, slidesOf(dir));
  assert.equal(fatal.length, 1);
  assert.match(fatal[0], /changed since it was proofread/);
});

test("a check disposition is allowed but listed with its note", () => {
  const dir = deck();
  markProofread(dir, "02-slide-method.png", "check", "garbled sigma in eq. 2");
  const { fatal, checks } = proofreadGate(dir, slidesOf(dir));
  assert.deepEqual(fatal, []);
  assert.deepEqual(checks, ["02-slide-method.png — garbled sigma in eq. 2"]);
});

test("an invalid status is not a disposition", () => {
  const dir = deck({ proofread: (d) => ({ "02-slide-method.png": { sha256: sha256File(join(d, "02-slide-method.png")), status: "looks fine" } }) });
  assert.equal(proofreadGate(dir, slidesOf(dir)).fatal.length, 1);
  assert.throws(() => markProofread(dir, "02-slide-method.png", "fine"), /ok or check/);
});

test("a deck without generated.json (extract-only) is not gated", () => {
  const dir = deck({ generated: null });
  assert.deepEqual(proofreadGate(dir, slidesOf(dir)), { fatal: [], warnings: [], checks: [] });
});

test("an unreadable ledger is fatal, not 'nothing to proofread'", () => {
  const dir = deck();
  writeFileSync(join(dir, "proofread.json"), "{not json");
  assert.match(proofreadGate(dir, slidesOf(dir)).fatal[0], /cannot read/);
});

for (const [name, mod, ext] of [["merge-to-pptx", pptx, "pptx"], ["merge-to-pdf", pdf, "pdf"]]) {
  test(`${name} refuses an unproofread deck and writes nothing`, async () => {
    const dir = deck();
    const out = join(dir, `out.${ext}`);
    assert.equal(await mod.main([dir, "--output", out]), 1);
    assert.equal(existsSync(out), false);
  });

  test(`${name} merges with --allow-unproofread, and after proofreading`, async () => {
    const dir = deck();
    const forced = join(dir, `forced.${ext}`);
    assert.equal(await mod.main([dir, "--output", forced, "--allow-unproofread"]), 0);
    assert.ok(readFileSync(forced).length > 100);
    markProofread(dir, "02-slide-method.png", "ok");
    const clean = join(dir, `clean.${ext}`);
    assert.equal(await mod.main([dir, "--output", clean]), 0);
    assert.ok(existsSync(clean));
  });
}

// ---- regressions: stage-5 adversary findings ----

async function captureStderr(fn) {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.join(" "));
  try {
    return { result: await fn(), stderr: lines.join("\n") };
  } finally {
    console.error = original;
  }
}

function deckOfTwo() {
  const dir = mkdtempSync(join(tmpdir(), "psd-proof2-"));
  writeFileSync(join(dir, "01-slide-cover.png"), PNG);
  writeFileSync(join(dir, "02-slide-method.png"), PNG2);
  recordGenerated(dir, "01-slide-cover.png", "gemini-x");
  recordGenerated(dir, "02-slide-method.png", "gemini-x");
  return dir;
}

for (const [name, mod, ext] of [["merge-to-pptx", pptx, "pptx"], ["merge-to-pdf", pdf, "pdf"]]) {
  test(`${name} names every unproofread slide on stderr`, async () => {
    const dir = deckOfTwo();
    const { result, stderr } = await captureStderr(() => mod.main([dir, "--output", join(dir, `o.${ext}`)]));
    assert.equal(result, 1);
    assert.match(stderr, /2 AI-generated slide\(s\) not proofread/);
    assert.match(stderr, /01-slide-cover\.png/);
    assert.match(stderr, /02-slide-method\.png/);
  });

  test(`${name} lists [CHECK] slides and the --allow-unproofread warning`, async () => {
    const dir = deckOfTwo();
    markProofread(dir, "01-slide-cover.png", "check", "garbled sigma");
    const { result, stderr } = await captureStderr(() =>
      mod.main([dir, "--output", join(dir, `o.${ext}`), "--allow-unproofread"]));
    assert.equal(result, 0);
    assert.match(stderr, /\[CHECK\] 01-slide-cover\.png — garbled sigma/);
    assert.match(stderr, /Warning: 1 AI-generated slide\(s\) not proofread.*02-slide-method\.png.*--allow-unproofread/);
  });
}

test("a renamed generated slide is still gated, and its disposition follows its bytes", () => {
  const dir = deck();
  renameSync(join(dir, "02-slide-method.png"), join(dir, "03-slide-method-v2.PNG"));
  const renamed = [{ filename: "03-slide-method-v2.PNG", path: join(dir, "03-slide-method-v2.PNG") }];
  assert.match(proofreadGate(dir, renamed).fatal[0], /03-slide-method-v2\.PNG \(no proofread disposition\)/);
  markProofread(dir, "03-slide-method-v2.PNG", "ok");
  assert.deepEqual(proofreadGate(dir, renamed).fatal, []);
});

test("a recorded slide missing from the deck is warned about", () => {
  const dir = deck();
  const { warnings } = proofreadGate(dir, [{ filename: "01-slide-figure.png", path: join(dir, "01-slide-figure.png") }]);
  assert.match(warnings.join(" "), /not in the deck: 02-slide-method\.png/);
});

test("prompts without a generated.json ledger are warned about (Gemini Web path)", () => {
  const dir = deck({ generated: null });
  mkdirSync(join(dir, "prompts"));
  const { fatal, warnings } = proofreadGate(dir, slidesOf(dir));
  assert.deepEqual(fatal, []);
  assert.match(warnings.join(" "), /cannot tell which slides are AI-generated/);
});

test("slides in the slides/ subdirectory can be recorded and marked", () => {
  const dir = mkdtempSync(join(tmpdir(), "psd-sub-"));
  mkdirSync(join(dir, "slides"));
  writeFileSync(join(dir, "slides", "04-slide-x.png"), PNG);
  recordGenerated(dir, "04-slide-x.png", "gemini-web");
  const slides = [{ filename: "04-slide-x.png", path: join(dir, "slides", "04-slide-x.png") }];
  assert.equal(proofreadGate(dir, slides).fatal.length, 1);
  markProofread(dir, "04-slide-x.png", "ok");
  assert.deepEqual(proofreadGate(dir, slides).fatal, []);
});
