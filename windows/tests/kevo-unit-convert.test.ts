import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convertUnits } from '../src/workspace/jarvis/voice/kevo-unit-convert';

describe('Kevo unit conversion', () => {
  it('converts meters to feet', () => {
    const r = convertUnits(1, 'meters', 'feet');
    assert.equal(r.ok, true);
    assert.ok(Math.abs((r.value ?? 0) - 3.281) < 0.01);
    assert.match(r.speech, /^1 meters is 3\.28/);
  });

  it('converts celsius to fahrenheit, with or without "degrees"', () => {
    const r = convertUnits(0, 'celsius', 'fahrenheit');
    assert.equal(r.ok, true);
    assert.equal(r.value, 32);
    assert.match(r.speech, /^0 celsius is 32 fahrenheit\./);
    assert.equal(convertUnits(212, 'degrees fahrenheit', 'degrees celsius').value, 100);
    assert.equal(convertUnits(0, 'c', 'k').value, 273.15);
  });

  it('converts kilograms to pounds and back', () => {
    const r = convertUnits(1, 'kg', 'pounds');
    assert.equal(r.ok, true);
    assert.ok(Math.abs((r.value ?? 0) - 2.205) < 0.01);
    assert.ok(Math.abs((convertUnits(10, 'lbs', 'kilograms').value ?? 0) - 4.536) < 0.01);
  });

  it('understands plurals and British spellings', () => {
    assert.ok(Math.abs((convertUnits(12, 'inches', 'centimetres').value ?? 0) - 30.48) < 0.01);
    assert.equal(convertUnits(5, 'kilometres', 'metres').value, 5000);
  });

  it('rejects unknown units, mixed kinds and object keys', () => {
    assert.match(convertUnits(10, 'apples', 'oranges').speech, /do not know how to convert/);
    assert.equal(convertUnits(1, 'meters', 'kilograms').ok, false);
    assert.equal(convertUnits(1, 'constructor', 'toString').ok, false);
  });
});
