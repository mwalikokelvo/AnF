// validateSlideNumbers tests (node --test tests/merge-numbers.test.mjs, node >= 23.6
// for native TS type-stripping). Manual renumbering after add/delete is the most
// error-prone step of the workflow; sort() alone hides duplicates and gaps.
import { test } from "node:test";
import assert from "node:assert/strict";

const { validateSlideNumbers } = await import("../scripts/merge-to-pptx.ts");
const { validateSlideNumbers: validatePdf } = await import("../scripts/merge-to-pdf.ts");

const slide = (index, filename) => ({ filename, path: filename, index });

test("consecutive numbering from 01 passes clean", () => {
  for (const validate of [validateSlideNumbers, validatePdf]) {
    const { fatal, warnings } = validate([
      slide(1, "01-slide-cover.png"),
      slide(2, "02-slide-intro.png"),
      slide(3, "03-slide-method.png"),
    ]);
    assert.deepEqual(fatal, []);
    assert.deepEqual(warnings, []);
  }
});

test("duplicate slide numbers are fatal", () => {
  const { fatal, warnings } = validateSlideNumbers([
    slide(1, "01-slide-cover.png"),
    slide(2, "02-slide-intro.png"),
    slide(2, "02-slide-renamed.png"),
  ]);
  assert.equal(fatal.length, 1);
  assert.match(fatal[0], /duplicate slide number 02/);
  assert.match(fatal[0], /02-slide-intro\.png, 02-slide-renamed\.png/);
  assert.deepEqual(warnings, []);
});

test("gaps warn without blocking", () => {
  const { fatal, warnings } = validateSlideNumbers([
    slide(1, "01-slide-cover.png"),
    slide(3, "03-slide-method.png"),
  ]);
  assert.deepEqual(fatal, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /gap\(s\): 02 missing between 01\.\.03/);
  assert.match(warnings[0], /renumber after deleting/);
});

test("a deck starting at 03 warns", () => {
  const { warnings } = validateSlideNumbers([slide(3, "03-slide-x.png"), slide(4, "04-slide-y.png")]);
  assert.deepEqual(warnings.filter((w) => /starts at/.test(w)), ["deck starts at 03, not 01"]);
});

test("zero-based decks are tolerated silently", () => {
  const { fatal, warnings } = validateSlideNumbers([slide(0, "0-slide-cover.png"), slide(1, "1-slide-x.png")]);
  assert.deepEqual(fatal, []);
  assert.deepEqual(warnings, []);
});
