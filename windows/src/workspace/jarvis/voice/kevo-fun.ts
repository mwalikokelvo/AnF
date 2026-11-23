/**
 * Offline fun for Kevo: dice and short facts. Nothing is sent anywhere. From Grok's roll-dice and random-fact
 * branches, rebuilt here.
 */

const NUMBER_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

/** Strips "kevo", "please" and "can you" around a request. */
export function bareRequest(lower: string): string {
  return lower
    .replace(/[.!?]+$/, '')
    .trim()
    .replace(/^kevo[\s,]+/, '')
    .replace(/^(?:(?:can|could|would|will) you(?: please)?|please)[\s,]+/, '')
    .replace(/[\s,]+(?:please|kevo|for me)$/, '');
}

/** "roll a die", "roll the dice", "roll two dice", "roll 3 dice", "roll a d20", "roll 2d6". Null for anything else. */
export function parseDiceRequest(lower: string): { count: number; sides: number } | null {
  const said = bareRequest(lower);
  const short = /^(?:roll|throw)(?: me)? (\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten)? ?d(\d+)$/.exec(said);
  const long = /^(?:roll|throw)(?: me)? (?:(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|the|some) )?(?:dice|die)(?: with (\d+) sides)?$/.exec(said);
  const m = short ?? long;
  if (!m) return null;
  const word = m[1] ?? 'a';
  const count = /^\d+$/.test(word) ? Number(word) : word === 'some' ? 2 : NUMBER_WORDS[word] ?? 1;
  const sides = Number(m[2] ?? 6);
  if (count < 1 || count > 10 || sides < 2 || sides > 100) return null;
  return { count, sides };
}

/** "You rolled a 4." or "You rolled 3, 5 and 2, a total of 10." */
export function rollDice(count: number, sides: number, random: () => number = Math.random): { rolls: number[]; reply: string } {
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(random() * sides));
  if (count === 1) return { rolls, reply: `You rolled ${/^8|^11$|^18$/.test(String(rolls[0])) ? 'an' : 'a'} ${rolls[0]}.` };
  const listed = `${rolls.slice(0, -1).join(', ')} and ${rolls[rolls.length - 1]}`;
  return { rolls, reply: `You rolled ${listed}, a total of ${rolls.reduce((a, b) => a + b, 0)}.` };
}

/** Short, checked facts, read aloud by "tell me a fact". */
export const FACTS: readonly string[] = [
  'Honey never spoils. Pots of honey thousands of years old have been found in Egyptian tombs, still edible.',
  'Octopuses have three hearts. Two pump blood through the gills and one pumps it to the rest of the body.',
  'A group of flamingos is called a flamboyance.',
  'Bananas are berries, but strawberries are not.',
  'The Eiffel Tower grows by up to 15 centimetres in summer, because the iron expands in the heat.',
  'Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid.',
  'Wombats leave cube-shaped droppings.',
  'The shortest war on record, between Britain and Zanzibar in 1896, lasted under an hour.',
  'There are more possible games of chess than there are atoms in the observable universe.',
  'Sea otters often hold paws while they sleep, so they do not drift apart.',
  'A day on Venus is longer than its year: it spins once every 243 Earth days but goes round the Sun in 225.',
  'Sharks were swimming in the oceans before the first trees grew on land.',
  'A day on Mars is about 40 minutes longer than a day on Earth.',
  'Mount Kenya is the second-highest mountain in Africa, after Kilimanjaro.',
];

/** "tell me a fact", "random fact", "fun fact", "tell me something interesting". */
export function isFactRequest(lower: string): boolean {
  return /^(?:(?:tell|give) me (?:a|another) (?:random |fun |interesting )?fact|(?:a |another )?(?:random |fun )fact|tell me something (?:interesting|i don'?t know))$/.test(bareRequest(lower));
}

/** A fact, never the same as `last`. */
export function randomFact(last = '', random: () => number = Math.random): string {
  const pool = FACTS.filter((f) => f !== last);
  return pool[Math.floor(random() * pool.length)] ?? FACTS[0];
}
