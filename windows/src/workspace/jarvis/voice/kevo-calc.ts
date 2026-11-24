/**
 * Kevo Calculator: safe arithmetic evaluation for expressions like "what is 15 percent of 200" or "2 + 2 * 3".
 * No eval; uses a simple parser or Function with limited scope.
 */

export function safeCalculate(expr: string): number | null {
  const cleaned = expr.replace(/what is |calculate |how much is /gi, '').trim();
  // Basic percent handling
  const pct = /(\d+(?:\.\d+)?)\s*(?:percent|%)\s*(?:of)?\s*(\d+(?:\.\d+)?)/i.exec(cleaned);
  if (pct) return (parseFloat(pct[1]) / 100) * parseFloat(pct[2]);
  // Allow only numbers, operators, parens, spaces
  if (!/^[0-9+\-*/().\s]+$/.test(cleaned)) return null;
  try {
    // Use Function with no access to globals
    const fn = new Function(`"use strict"; return (${cleaned});`);
    const result = fn();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

export function formatResult(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}
