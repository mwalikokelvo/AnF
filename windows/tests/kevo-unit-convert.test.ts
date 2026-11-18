import { convertUnits } from '../src/workspace/jarvis/voice/kevo-unit-convert';

describe('Kevo unit conversion', () => {
  it('converts meters to feet', () => {
    const r = convertUnits(1, 'meters', 'feet');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(3.281, 2);
    expect(r.speech).toMatch(/1 meters is/);
  });

  it('converts celsius to fahrenheit', () => {
    const r = convertUnits(0, 'celsius', 'fahrenheit');
    expect(r.ok).toBe(true);
    expect(r.value).toBe(32);
    expect(r.speech).toMatch(/0 celsius is 32/);
  });

  it('converts kilograms to pounds', () => {
    const r = convertUnits(1, 'kg', 'pounds');
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(2.205, 2);
  });

  it('rejects unknown units', () => {
    const r = convertUnits(10, 'apples', 'oranges');
    expect(r.ok).toBe(false);
    expect(r.speech).toMatch(/do not know how to convert/);
  });
});
