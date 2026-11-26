/**
 * Offline "quote from a book" for Kevo.
 * A small curated list of public-domain or widely known short quotes.
 * Nothing is sent; pure local.
 */

const QUOTES = [
  { book: '1984', author: 'George Orwell', text: 'Big Brother is watching you.' },
  { book: 'Pride and Prejudice', author: 'Jane Austen', text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.' },
  { book: 'The Great Gatsby', author: 'F. Scott Fitzgerald', text: 'So we beat on, boats against the current, borne back ceaselessly into the past.' },
  { book: 'To Kill a Mockingbird', author: 'Harper Lee', text: 'You never really understand a person until you consider things from his point of view.' },
  { book: 'Dune', author: 'Frank Herbert', text: 'Fear is the mind-killer.' },
];

export function randomBookQuote(): string {
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  return `From ${q.book} by ${q.author}: ${q.text}`;
}

export function isBookQuoteRequest(text: string): boolean {
  return /\b(?:book quote|quote from a book|literary quote|read me a quote)\b/i.test(text);
}
