/** Kevo Random: coin flip, random number, random choice. Offline, no API.
 * Matches common voice assistant "flip a coin" / "pick a number" behaviors.
 */

export function flipCoin(): 'heads' | 'tails' {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

export function randomNumber(min = 1, max = 10): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomChoice(options: string[]): string | null {
  if (!options.length) return null;
  return options[Math.floor(Math.random() * options.length)];
}

export function formatCoin(): string {
  return `It's ${flipCoin()}.`;
}

export function formatNumber(n: number): string {
  return `The number is ${n}.`;
}
