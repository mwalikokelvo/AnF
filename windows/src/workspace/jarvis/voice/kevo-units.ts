/**
 * Local unit conversions for Kevo. Nothing leaves the device.
 * Supports temperature, length, weight and volume.
 */

const TEMP_UNITS = { c: 'celsius', f: 'fahrenheit', k: 'kelvin', celsius: 'celsius', fahrenheit: 'fahrenheit', kelvin: 'kelvin' } as const;
type TempUnit = typeof TEMP_UNITS[keyof typeof TEMP_UNITS];

export function convertTemperature(value: number, from: string, to: string): number | null {
  const f = TEMP_UNITS[from.toLowerCase() as keyof typeof TEMP_UNITS];
  const t = TEMP_UNITS[to.toLowerCase() as keyof typeof TEMP_UNITS];
  if (!f || !t || f === t) return value;
  let c = f === 'celsius' ? value : f === 'fahrenheit' ? (value - 32) * 5 / 9 : value - 273.15;
  return t === 'celsius' ? c : t === 'fahrenheit' ? c * 9 / 5 + 32 : c + 273.15;
}

const LENGTH: Record<string, number> = { m: 1, meter: 1, metres: 1, cm: 0.01, mm: 0.001, km: 1000, in: 0.0254, inch: 0.0254, ft: 0.3048, foot: 0.3048, yd: 0.9144, mi: 1609.34, mile: 1609.34 };
const WEIGHT: Record<string, number> = { kg: 1, kilogram: 1, g: 0.001, gram: 0.001, lb: 0.453592, pound: 0.453592, oz: 0.0283495, ounce: 0.0283495 };
const VOLUME: Record<string, number> = { l: 1, liter: 1, litre: 1, ml: 0.001, gal: 3.78541, gallon: 3.78541, cup: 0.236588 };

export function convertUnit(value: number, from: string, to: string, category: 'length' | 'weight' | 'volume'): number | null {
  const map = category === 'length' ? LENGTH : category === 'weight' ? WEIGHT : VOLUME;
  const f = map[from.toLowerCase()];
  const t = map[to.toLowerCase()];
  if (f == null || t == null) return null;
  return (value * f) / t;
}

/** Parses "convert 100 f to c", "32 degrees fahrenheit in celsius", "5 miles to km". */
export function parseConvertRequest(lower: string): { value: number; from: string; to: string; category: 'temp' | 'length' | 'weight' | 'volume' } | null {
  const m = /(?:convert|what is|how many)?\s*([\d.]+)\s*(?:degrees?\s+)?([a-z]+)\s+(?:to|in|as)\s+([a-z]+)/.exec(lower);
  if (!m) return null;
  const value = Number(m[1]);
  const from = m[2];
  const to = m[3];
  if (TEMP_UNITS[from as keyof typeof TEMP_UNITS] && TEMP_UNITS[to as keyof typeof TEMP_UNITS]) return { value, from, to, category: 'temp' };
  if (LENGTH[from] && LENGTH[to]) return { value, from, to, category: 'length' };
  if (WEIGHT[from] && WEIGHT[to]) return { value, from, to, category: 'weight' };
  if (VOLUME[from] && VOLUME[to]) return { value, from, to, category: 'volume' };
  return null;
}
