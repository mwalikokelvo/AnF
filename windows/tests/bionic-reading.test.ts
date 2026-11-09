import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getFixationLength,
  bionifyWord,
  formatBionicText,
  computeReadingStats,
  parseBionicSpans,
} from '../src/workspace/bionic-reading.js';

test('Bionic Reading & Speed Reader Engine', async (t) => {
  await t.test('getFixationLength scales with word length', () => {
    assert.equal(getFixationLength(1), 1);
    assert.equal(getFixationLength(3), 1);
    assert.equal(getFixationLength(5), 2);
    assert.equal(getFixationLength(8), 3);
    assert.equal(getFixationLength(12), 6);
  });

  await t.test('bionifyWord bolds leading letters and preserves punctuation', () => {
    assert.equal(bionifyWord('the'), '<b>t</b>he');
    assert.equal(bionifyWord('fast'), '<b>fa</b>st');
    assert.equal(bionifyWord('"reading,"'), '"<b>rea</b>ding,"');
    assert.equal(bionifyWord('(comprehension)'), '(<b>compre</b>hension)');
  });

  await t.test('formatBionicText preserves markdown headings, code blocks and URLs', () => {
    const input = [
      '# Introduction to Sound',
      'The Web Audio API is powerful.',
      'Visit https://developer.mozilla.org for details.',
      'Use `const ctx = new AudioContext()` inline.',
      '```javascript',
      'function test() { return 42; }',
      '```',
    ].join('\n');

    const output = formatBionicText(input);

    // Headings marker preserved
    assert.match(output, /^# <b>Introd<\/b>uction <b>t<\/b>o <b>So<\/b>und/m);
    // URL preserved untouched
    assert.match(output, /https:\/\/developer\.mozilla\.org/);
    // Inline code preserved untouched
    assert.match(output, /`const ctx = new AudioContext\(\)`/);
    // Fenced code block preserved untouched
    assert.match(output, /function test\(\) \{ return 42; \}/);
  });

  await t.test('computeReadingStats calculates WPM and bionic time reduction', () => {
    const text = 'word '.repeat(500); // 500 words
    const stats = computeReadingStats(text, 250);

    assert.equal(stats.wordCount, 500);
    assert.equal(stats.standardMinutes, 2.0); // 500 / 250 = 2 min
    assert.ok(stats.bionicMinutes < stats.standardMinutes); // Bionic reading is faster
    assert.equal(stats.wpm, 250);
  });

  await t.test('computeReadingStats handles empty input gracefully', () => {
    const stats = computeReadingStats('');
    assert.equal(stats.wordCount, 0);
    assert.equal(stats.standardMinutes, 0);
    assert.equal(stats.bionicMinutes, 0);
  });

  await t.test('parseBionicSpans decomposes text into bold and plain tokens', () => {
    assert.deepEqual(parseBionicSpans(''), []);

    const spans = parseBionicSpans('Fast reading');
    assert.deepEqual(spans, [
      { bold: true, text: 'Fa' },
      { bold: false, text: 'st' },
      { bold: false, text: ' ' },
      { bold: true, text: 'rea' },
      { bold: false, text: 'ding' },
    ]);

    const punctuationSpans = parseBionicSpans('Hello, world!');
    assert.deepEqual(punctuationSpans, [
      { bold: true, text: 'He' },
      { bold: false, text: 'llo' },
      { bold: false, text: ', ' },
      { bold: true, text: 'wo' },
      { bold: false, text: 'rld' },
      { bold: false, text: '!' },
    ]);
  });
});
