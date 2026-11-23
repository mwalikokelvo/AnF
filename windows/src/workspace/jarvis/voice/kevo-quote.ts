/**
 * A quote of the day from a short list kept in the app, for "quote of the day" or "inspire me". Nothing is sent.
 * Grok's branch asked ZenQuotes, but its free service sends no CORS header, so the app's webview cannot read it.
 */

import { bareRequest } from './kevo-fun';

/** "quote of the day", "daily quote", "give me a quote", "inspire me". */
export function isQuoteRequest(lower: string): boolean {
  return /^(?:(?:give me|tell me|read me|what'?s|what is) )?(?:a |the |today'?s )?(?:daily |inspiring |inspirational )?quote(?: of the day| for today)?$|^inspire me$/.test(bareRequest(lower));
}

export const QUOTES: readonly { text: string; from: string }[] = [
  { text: 'Well begun is half done.', from: 'Aristotle' },
  { text: 'The unexamined life is not worth living.', from: 'Socrates' },
  { text: 'The journey of a thousand miles begins with a single step.', from: 'Lao Tzu' },
  { text: 'Our heart is restless until it rests in you.', from: 'Saint Augustine' },
  { text: 'Whatever you do, work at it with all your heart.', from: 'Saint Paul, Colossians 3:23' },
  { text: 'Rejoice in hope, be patient in tribulation, be constant in prayer.', from: 'Saint Paul, Romans 12:12' },
  { text: 'Act justly, love mercy and walk humbly with your God.', from: 'the prophet Micah' },
  { text: 'This above all: to thine own self be true.', from: 'William Shakespeare' },
  { text: 'Hope is the thing with feathers that perches in the soul.', from: 'Emily Dickinson' },
  { text: 'Lost time is never found again.', from: 'Benjamin Franklin' },
  { text: 'Well done is better than well said.', from: 'Benjamin Franklin' },
  { text: 'The only thing we have to fear is fear itself.', from: 'Franklin D. Roosevelt' },
  { text: 'Injustice anywhere is a threat to justice everywhere.', from: 'Martin Luther King Jr.' },
  { text: 'Nothing in life is to be feared, it is only to be understood.', from: 'Marie Curie' },
  { text: 'Haba na haba hujaza kibaba. Little by little fills the measure.', from: 'a Swahili proverb' },
  { text: 'If you want to go fast, go alone. If you want to go far, go together.', from: 'an African proverb' },
  { text: 'The best time to plant a tree was twenty years ago. The second best time is now.', from: 'a proverb' },
  { text: 'Fortune favours the bold.', from: 'a Latin proverb' },
];

/** "Today's quote, from Aristotle: Well begun is half done." The same quote all day, a new one each day. */
export function quoteOfTheDay(now: Date = new Date()): string {
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000);
  const { text, from } = QUOTES[day % QUOTES.length];
  return `Today's quote, from ${from}: ${text}`;
}
