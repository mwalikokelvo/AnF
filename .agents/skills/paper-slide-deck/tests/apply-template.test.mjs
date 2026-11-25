// wrapText / tokenizeText tests (node --test tests/apply-template.test.mjs).
// Run against the TS source via node's type stripping: node --version >= 23.6.
// The determinstic fake ctx measures CJK chars as 2 units and everything else
// as 1, so assertions do not depend on installed fonts.
import { test } from "node:test";
import assert from "node:assert/strict";

const { wrapText, tokenizeText } = await import("../scripts/apply-template.ts");

const fakeCtx = {
  measureText: (s) => ({
    width: [...s].reduce((w, ch) => w + (ch.codePointAt(0) >= 0x3000 ? 2 : 1), 0),
  }),
};

test("tokenizeText keeps Latin words whole and splits every CJK char", () => {
  assert.deepEqual(tokenizeText("hello world"), ["hello", "world"]);
  assert.deepEqual(tokenizeText("基于扩散模型的图像重建"), [
    "基", "于", "扩", "散", "模", "型", "的", "图", "像", "重", "建",
  ]);
  assert.deepEqual(tokenizeText("Diffusion 模型 for 重建"), [
    "Diffusion", "模", "型", "for", "重", "建",
  ]);
});

test("wrapText breaks a long Chinese title into multiple lines", () => {
  // maxWidth 20 units = 10 CJK chars; the old space-splitting produced ONE line.
  const text = "基于扩散模型的低剂量CT图像重建方法研究";
  const lines = wrapText(fakeCtx, text, 20);
  assert.ok(lines.length >= 2, `expected >=2 lines, got ${lines.length}`);
  for (const line of lines) {
    assert.ok(fakeCtx.measureText(line).width <= 20, `line too wide: ${line}`);
  }
  assert.equal(lines.join(""), text);
});

test("wrapText joins CJK runs without inserting spaces, keeps Latin spacing", () => {
  // Inter-CJK spaces are input artifacts of Chinese typing and are dropped on
  // rejoin; spaces between Latin words are preserved.
  const lines = wrapText(fakeCtx, "扩散模型 图像重建", 100);
  assert.deepEqual(lines, ["扩散模型图像重建"]);
  const mixed = wrapText(fakeCtx, "low-dose CT reconstruction 低剂量重建", 45);
  assert.deepEqual(mixed, ["low-dose CT reconstruction低剂量重建"]);
});

test("wrapText hard-breaks an unbreakable token wider than the line", () => {
  const lines = wrapText(fakeCtx, "aaaaaaaaaaaaaaaaaaaaaa", 10);
  assert.ok(lines.length >= 2);
  for (const line of lines) {
    assert.ok(line.length <= 10, `chunk longer than maxWidth: ${line}`);
  }
  assert.equal(lines.join(""), "aaaaaaaaaaaaaaaaaaaaaa");
});

test("wrapText on pure Latin behaves like word wrapping", () => {
  const lines = wrapText(fakeCtx, "the quick brown fox jumps", 11);
  assert.deepEqual(lines, ["the quick", "brown fox", "jumps"]);
});
