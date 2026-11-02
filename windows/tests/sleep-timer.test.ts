import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chapterEndAt, chapterSleepStep } from '../src/workspace/sleep-timer.js';

const ch = [
  { title: 'One', start: 0 },
  { title: 'Two', start: 100 },
  { title: 'Three', start: 250 },
];

describe('chapterEndAt', () => {
  test('returns the next chapter start', () => {
    assert.equal(chapterEndAt(ch, 10, 400), 100);
    assert.equal(chapterEndAt(ch, 100, 400), 250, 'exactly on a boundary belongs to the new chapter');
    assert.equal(chapterEndAt(ch, 249.9, 400), 250);
  });
  test('last chapter ends at the duration', () => {
    assert.equal(chapterEndAt(ch, 300, 400), 400);
  });
  test('last chapter without a usable duration is null', () => {
    assert.equal(chapterEndAt(ch, 300, NaN), null);
    assert.equal(chapterEndAt(ch, 300, 0), null);
    assert.equal(chapterEndAt(ch, 300, Infinity), null);
  });
  test('no chapters is null', () => {
    assert.equal(chapterEndAt([], 5, 100), null);
    assert.equal(chapterEndAt(undefined, 5, 100), null);
  });
  test('unsorted and malformed chapters are tolerated', () => {
    const messy = [{ title: 'b', start: 100 }, { title: 'x', start: NaN }, { title: 'a', start: 0 }];
    assert.equal(chapterEndAt(messy, 5, 200), 100);
  });
  test('position before the first marker ends at the first marker', () => {
    assert.equal(chapterEndAt([{ title: 'A', start: 30 }], 5, 200), 30);
  });
});

describe('chapterSleepStep', () => {
  test('keeps playing before the stop point', () => {
    assert.deepEqual(chapterSleepStep(100, ch, 50, 400), { stop: false, at: 100 });
  });
  test('stops within tolerance of the stop point', () => {
    assert.deepEqual(chapterSleepStep(100, ch, 99.8, 400), { stop: true, at: 100 });
    assert.deepEqual(chapterSleepStep(100, ch, 100.5, 400), { stop: true, at: 100 });
  });
  test('a forward seek well past the point re-arms on the new chapter', () => {
    assert.deepEqual(chapterSleepStep(100, ch, 260, 400), { stop: false, at: 400 });
    assert.deepEqual(chapterSleepStep(100, ch, 120, 400), { stop: false, at: 250 });
  });
  test('a seek back keeps the armed point', () => {
    assert.deepEqual(chapterSleepStep(250, ch, 10, 400), { stop: false, at: 250 });
  });
  test('re-arming with nothing usable stops', () => {
    assert.deepEqual(chapterSleepStep(100, [], 260, NaN), { stop: true, at: 100 });
  });
});
