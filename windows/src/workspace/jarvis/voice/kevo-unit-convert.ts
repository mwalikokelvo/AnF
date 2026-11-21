/**
 * Offline unit conversion for Kevo.
 * Supports common length, mass and temperature conversions without network.
 * Ideas from open voice assistants (Mycroft/OVOS convert_measurement skill).
 */

export interface ConversionResult {
  ok: boolean;
  speech: string;
  value?: number;
  from?: string;
  to?: string;
}

const LENGTH: Record<string, number> = {
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  m: 1,
  meter: 1,
  meters: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  in: 0.0254,
  inch: 0.0254,
  inches: 0.0254,
  ft: 0.3048,
  foot: 0.3048,
  feet: 0.3048,
  yd: 0.9144,
  yard: 0.9144,
  yards: 0.9144,
  mi: 1609.344,
  mile: 1609.344,
  miles: 1609.344,
};

const MASS: Record<string, number> = {
  mg: 0.001,
  milligram: 0.001,
  milligrams: 0.001,
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  kilogram: 1000,
  kilograms: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
};

// The tables list singular and plural forms, so nothing is stripped (stripping a final "s" broke "celsius" and "inches").
// British spellings ("metres", "kilometres") map to the table's "meter" forms; "lbs" to "lb".
function normalize(unit: string): string {
  return unit.toLowerCase().trim().replace(/metre(s?)$/, 'meter$1').replace(/^lbs$/, 'lb');
}

export function convertUnits(value: number, fromRaw: string, toRaw: string): ConversionResult {
  const from = normalize(fromRaw);
  const to = normalize(toRaw);
  if (!Number.isFinite(value)) {
    return { ok: false, speech: 'I need a number to convert.' };
  }

  // Temperature special case
  const tempFrom = from === 'c' || from === 'celsius' ? 'c' : from === 'f' || from === 'fahrenheit' ? 'f' : from === 'k' || from === 'kelvin' ? 'k' : null;
  const tempTo = to === 'c' || to === 'celsius' ? 'c' : to === 'f' || to === 'fahrenheit' ? 'f' : to === 'k' || to === 'kelvin' ? 'k' : null;
  if (tempFrom && tempTo) {
    let celsius: number;
    if (tempFrom === 'c') celsius = value;
    else if (tempFrom === 'f') celsius = (value - 32) * 5 / 9;
    else celsius = value - 273.15;
    let result: number;
    if (tempTo === 'c') result = celsius;
    else if (tempTo === 'f') result = celsius * 9 / 5 + 32;
    else result = celsius + 273.15;
    const rounded = Math.round(result * 100) / 100;
    return {
      ok: true,
      value: rounded,
      from: fromRaw,
      to: toRaw,
      speech: `${value} ${fromRaw} is ${rounded} ${toRaw}.`,
    };
  }

  // Length or mass
  const fromLen = LENGTH[from];
  const toLen = LENGTH[to];
  if (fromLen && toLen) {
    const result = (value * fromLen) / toLen;
    const rounded = Math.round(result * 1000) / 1000;
    return {
      ok: true,
      value: rounded,
      from: fromRaw,
      to: toRaw,
      speech: `${value} ${fromRaw} is ${rounded} ${toRaw}.`,
    };
  }
  const fromMass = MASS[from];
  const toMass = MASS[to];
  if (fromMass && toMass) {
    const result = (value * fromMass) / toMass;
    const rounded = Math.round(result * 1000) / 1000;
    return {
      ok: true,
      value: rounded,
      from: fromRaw,
      to: toRaw,
      speech: `${value} ${fromRaw} is ${rounded} ${toRaw}.`,
    };
  }

  return { ok: false, speech: `I do not know how to convert ${fromRaw} to ${toRaw} yet. Try metres, feet, kilograms, pounds, or Celsius and Fahrenheit.` };
}
