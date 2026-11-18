/**
 * Tests for Kevo's safe joke capability.
 * Run with: npx tsx windows/tests/kevo-jokes.test.ts (or the project's test runner).
 */

import { formatJokeReply, type JokeResult } from '../src/workspace/jarvis/voice/kevo-jokes';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function testFormatNull() {
  const reply = formatJokeReply(null);
  assert(reply.includes('could not get a joke'), 'null joke should give a friendly failure');
  console.log('PASS: format null');
}

function testFormatJoke() {
  const joke: JokeResult = { text: 'Why do programmers prefer dark mode? Because light attracts bugs.', category: 'Programming', id: 1 };
  const reply = formatJokeReply(joke);
  assert(reply === joke.text, 'should return the joke text');
  console.log('PASS: format joke');
}

// Live fetch is skipped in CI unless network is allowed; the formatter is the unit under test.
testFormatNull();
testFormatJoke();
console.log('All kevo-jokes tests passed.');
