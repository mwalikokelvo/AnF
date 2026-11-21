import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertUnits } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

test('convertUnits handles length', () => {
  assert.match(convertUnits('convert 12 inches to centimetres') || '', /30\.48/);
  assert.match(convertUnits('5 feet to metres') || '', /1\.524/);
});

test('convertUnits handles weight', () => {
  assert.match(convertUnits('10 kg to pounds') || '', /22\.0462/);
});

test('convertUnits handles temperature', () => {
  assert.match(convertUnits('0 celsius to fahrenheit') || '', /32/);
  assert.match(convertUnits('100 celsius to fahrenheit') || '', /212/);
});

test('convertUnits returns null for non-conversions', () => {
  assert.equal(convertUnits('what is the weather'), null);
  assert.equal(convertUnits('convert apples to oranges'), null);
});
