import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AbLoopEngine, formatTimeSeconds } from '../src/workspace/ab-loop';

test('formatTimeSeconds formats minutes and seconds with leading zero', () => {
  assert.equal(formatTimeSeconds(0), '0:00');
  assert.equal(formatTimeSeconds(45), '0:45');
  assert.equal(formatTimeSeconds(75), '1:15');
  assert.equal(formatTimeSeconds(600), '10:00');
});

test('AbLoopEngine initializes disabled with null endpoints', () => {
  const engine = new AbLoopEngine();
  const state = engine.getState();
  assert.equal(state.enabled, false);
  assert.equal(state.pointA, null);
  assert.equal(state.pointB, null);
  assert.equal(state.loopCount, 0);
  assert.equal(engine.formatStatus(), 'A-B Loop: Off');
});

test('AbLoopEngine sets Point A and waits for Point B', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(30);

  const state = engine.getState();
  assert.equal(state.pointA, 30);
  assert.equal(state.pointB, null);
  assert.equal(state.enabled, false);
  assert.equal(engine.formatStatus(), 'A: 0:30 · Set B');
});

test('AbLoopEngine activates when Point B is set after Point A', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(30);
  engine.setPointB(65);

  const state = engine.getState();
  assert.equal(state.pointA, 30);
  assert.equal(state.pointB, 65);
  assert.equal(state.enabled, true);
  assert.match(engine.formatStatus(), /🔁 \[0:30 – 1:05\]/);
});

test('AbLoopEngine defaults Point A to 0 if Point B is set first', () => {
  const engine = new AbLoopEngine();
  engine.setPointB(45);

  const state = engine.getState();
  assert.equal(state.pointA, 0);
  assert.equal(state.pointB, 45);
  assert.equal(state.enabled, true);
});

test('AbLoopEngine rejects Point B if less than or equal to Point A', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(50);
  engine.setPointB(40); // Invalid: earlier than A

  const state = engine.getState();
  assert.equal(state.pointA, 50);
  assert.equal(state.pointB, null);
  assert.equal(state.enabled, false);
});

test('AbLoopEngine checkLoop triggers seek to Point A and increments loopCount', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(10);
  engine.setPointB(20);

  // Time before boundary
  assert.equal(engine.checkLoop(15), null);
  assert.equal(engine.getState().loopCount, 0);

  // Time reached boundary
  const seek = engine.checkLoop(20);
  assert.equal(seek, 10);
  assert.equal(engine.getState().loopCount, 1);
  assert.match(engine.formatStatus(), /\(1x\)/);

  // Second loop
  const seek2 = engine.checkLoop(20.5);
  assert.equal(seek2, 10);
  assert.equal(engine.getState().loopCount, 2);
  assert.match(engine.formatStatus(), /\(2x\)/);
});

test('AbLoopEngine toggle enables and disables looping', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(10);
  engine.setPointB(20);

  assert.equal(engine.getState().enabled, true);
  engine.toggle();
  assert.equal(engine.getState().enabled, false);
  assert.match(engine.formatStatus(), /⏸/);

  // When disabled, checkLoop returns null even past boundary
  assert.equal(engine.checkLoop(25), null);

  engine.toggle();
  assert.equal(engine.getState().enabled, true);
});

test('AbLoopEngine clear resets points and disables loop', () => {
  const engine = new AbLoopEngine();
  engine.setPointA(10);
  engine.setPointB(20);
  engine.checkLoop(20);

  engine.clear();
  const state = engine.getState();
  assert.equal(state.pointA, null);
  assert.equal(state.pointB, null);
  assert.equal(state.enabled, false);
  assert.equal(state.loopCount, 0);
  assert.equal(engine.formatStatus(), 'A-B Loop: Off');
});
