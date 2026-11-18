import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertUnits } from '../src/workspace/jarvis/voice/kevo-unit-convert';
import { KEVO_ACTIONS } from '../src/workspace/jarvis/voice/kevo-actions';

describe('Kevo unit conversion', () => {
  it('converts meters to feet', () => {
    const r = convertUnits(1, 'meters', 'feet');
    assert.equal(r.ok, true);
    assert.ok(Math.abs((r.value ?? 0) - 3.281) < 0.01);
    assert.match(r.speech, /1 meters is/);
  });

  it('converts celsius to fahrenheit', () => {
    const r = convertUnits(0, 'celsius', 'fahrenheit');
    assert.equal(r.ok, true);
    assert.equal(r.value, 32);
    assert.match(r.speech, /0 celsius is 32/);
  });

  it('converts kilograms to pounds', () => {
    const r = convertUnits(1, 'kg', 'pounds');
    assert.equal(r.ok, true);
    assert.ok(Math.abs((r.value ?? 0) - 2.205) < 0.01);
  });

  it('handles plurals ending in s and British spellings', () => {
    assert.equal(convertUnits(12, 'inches', 'feet').value, 1);
    assert.equal(convertUnits(2, 'kilometres', 'metres').value, 2000);
    assert.equal(convertUnits(100, 'celsius', 'fahrenheit').value, 212);
    assert.ok(Math.abs((convertUnits(10, 'lbs', 'kg').value ?? 0) - 4.536) < 0.01);
  });

  it('rejects unknown units', () => {
    const r = convertUnits(10, 'apples', 'oranges');
    assert.equal(r.ok, false);
    assert.match(r.speech, /do not know how to convert/);
  });

  it('is a well-formed Kevo action (no gaps in the action list)', async () => {
    assert.ok(KEVO_ACTIONS.every(Boolean), 'every entry in KEVO_ACTIONS is defined');
    const action = KEVO_ACTIONS.find(a => a.name === 'convert_units');
    assert.ok(action, 'convert_units is registered');
    const result = await action.execute({ value: 5, from: 'km', to: 'miles' }, {} as never);
    assert.equal(result.handled, true);
    assert.match(result.speechReply ?? '', /5 km is 3\.1/);
  });
});
