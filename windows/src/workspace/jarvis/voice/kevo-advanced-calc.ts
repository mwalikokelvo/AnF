/**
 * Offline advanced calculations for Kevo: percentage, BMI, simple interest, square root.
 * Pure local, no network. Ideas from open voice assistants' calculation skills.
 */

export interface CalcResult {
  ok: boolean;
  speech: string;
}

export function isAdvancedCalcRequest(lower: string): boolean {
  const said = lower.replace(/^(kevo|hey kevo|jarvis)\s*/i, '').trim();
  return /^(?:what is |calculate |how much is )?(?:(\d+(?:\.\d+)?) percent of (\d+(?:\.\d+)?)|bmi for (\d+(?:\.\d+)?) kg and (\d+(?:\.\d+)?) cm|simple interest on (\d+(?:\.\d+)?) at (\d+(?:\.\d+)?) percent for (\d+(?:\.\d+)?) years|square root of (\d+(?:\.\d+)?))$/i.test(said);
}

export function advancedCalc(lower: string): CalcResult | null {
  const said = lower.replace(/^(kevo|hey kevo|jarvis)\s*/i, '').trim();
  let m = said.match(/(\d+(?:\.\d+)?) percent of (\d+(?:\.\d+)?)/i);
  if (m) {
    const pct = parseFloat(m[1]), of = parseFloat(m[2]);
    const result = (pct / 100) * of;
    return { ok: true, speech: `${pct} percent of ${of} is ${result.toFixed(2).replace(/\.00$/, '')}.` };
  }
  m = said.match(/bmi for (\d+(?:\.\d+)?) kg and (\d+(?:\.\d+)?) cm/i);
  if (m) {
    const kg = parseFloat(m[1]), cm = parseFloat(m[2]);
    const mtr = cm / 100;
    const bmi = kg / (mtr * mtr);
    return { ok: true, speech: `BMI is ${bmi.toFixed(1)}.` };
  }
  m = said.match(/simple interest on (\d+(?:\.\d+)?) at (\d+(?:\.\d+)?) percent for (\d+(?:\.\d+)?) years/i);
  if (m) {
    const p = parseFloat(m[1]), r = parseFloat(m[2]), t = parseFloat(m[3]);
    const interest = (p * r * t) / 100;
    return { ok: true, speech: `Simple interest is ${interest.toFixed(2).replace(/\.00$/, '')}.` };
  }
  m = said.match(/square root of (\d+(?:\.\d+)?)/i);
  if (m) {
    const n = parseFloat(m[1]);
    if (n < 0) return { ok: false, speech: 'Cannot take square root of a negative number.' };
    return { ok: true, speech: `Square root of ${n} is ${Math.sqrt(n).toFixed(2).replace(/\.00$/, '')}.` };
  }
  return null;
}
