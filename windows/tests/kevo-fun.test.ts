import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, isFactRequest, parseDiceRequest, randomFact, rollDice } from '../src/workspace/jarvis/voice/kevo-fun';
import { fetchQuote, isQuoteRequest } from '../src/workspace/jarvis/voice/kevo-quote';
import { answerTrivia, askTrivia, fetchTrivia, isTriviaRequest } from '../src/workspace/jarvis/voice/kevo-trivia';
import { parseTranslateRequest, translateFromEnglish } from '../src/workspace/jarvis/voice/kevo-translate';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';
import { ONLINE_LOOKUPS_OFF } from '../src/workspace/jarvis/voice/kevo-online';

const ok = (body: unknown) => async () => ({ ok: true, status: 200, json: async () => body });

/** Runs `body` with a fake global fetch that answers by URL and records each request. */
async function withFetch<T>(answer: (url: string) => unknown, body: (urls: string[]) => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    urls.push(String(url));
    return { ok: true, status: 200, json: async () => answer(String(url)) };
  }) as typeof fetch;
  try {
    return await body(urls);
  } finally {
    globalThis.fetch = real;
  }
}

const TRIVIA = {
  response_code: 0,
  results: [{ category: 'Geography', question: 'What%20is%20the%20capital%20of%20Kenya%3F', correct_answer: 'Nairobi', incorrect_answers: ['Mombasa', 'Kisumu', 'Nakuru'] }],
};

describe('Kevo dice', () => {
  it('understands dice requests', () => {
    assert.deepEqual(parseDiceRequest('roll a die'), { count: 1, sides: 6 });
    assert.deepEqual(parseDiceRequest('can you roll the dice please?'), { count: 1, sides: 6 });
    assert.deepEqual(parseDiceRequest('roll two dice'), { count: 2, sides: 6 });
    assert.deepEqual(parseDiceRequest('roll 3 dice with 20 sides'), { count: 3, sides: 20 });
    assert.deepEqual(parseDiceRequest('roll a d20'), { count: 1, sides: 20 });
    assert.deepEqual(parseDiceRequest('roll 2d6'), { count: 2, sides: 6 });
    for (const said of ['roll 50 dice', 'roll a d1', 'roll the window down', 'what is a die']) assert.equal(parseDiceRequest(said), null, said);
  });

  it('rolls within range and adds up', () => {
    assert.deepEqual(rollDice(1, 6, () => 0.5), { rolls: [4], reply: 'You rolled a 4.' });
    assert.equal(rollDice(1, 20, () => 0.39).reply, 'You rolled an 8.');
    assert.deepEqual(rollDice(3, 6, () => 0), { rolls: [1, 1, 1], reply: 'You rolled 1, 1 and 1, a total of 3.' });
    for (const r of rollDice(10, 20).rolls) assert.ok(r >= 1 && r <= 20);
  });

  it('answers through Kevo without the AI', async () => {
    const res = await new JarvisVoiceAgent({ switchView: () => {} }).processVoiceInput('roll two dice');
    assert.equal(res.actionName, 'roll_dice');
    assert.match(res.speechReply, /^You rolled \d, \d+ and \d+|^You rolled \d and \d, a total of \d+\.$/);
  });
});

describe('Kevo facts', () => {
  it('understands fact requests', () => {
    for (const said of ['tell me a fact', 'give me a random fact', 'fun fact', 'tell me something interesting', 'kevo, tell me another fun fact']) assert.equal(isFactRequest(said), true, said);
    for (const said of ['is that a fact', 'facts about the moon', 'tell me a joke']) assert.equal(isFactRequest(said), false, said);
  });

  it('never repeats the last fact', () => {
    for (const last of FACTS) assert.notEqual(randomFact(last, () => 0), last);
  });

  it('answers through Kevo without the AI', async () => {
    const res = await new JarvisVoiceAgent({ switchView: () => {} }).processVoiceInput('tell me a fact');
    assert.equal(res.actionName, 'random_fact');
    assert.ok(FACTS.includes(res.speechReply));
  });
});

describe('Kevo quote of the day', () => {
  it('understands quote requests', () => {
    for (const said of ['quote of the day', "what's the quote of the day?", 'give me a quote', 'inspire me', 'daily quote please']) assert.equal(isQuoteRequest(said), true, said);
    for (const said of ['quote me on that', 'get a quote for car insurance']) assert.equal(isQuoteRequest(said), false, said);
  });

  it('reads ZenQuotes', async () => {
    const urls: string[] = [];
    const quote = await fetchQuote(async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => [{ q: 'Well begun is half done.', a: 'Aristotle' }] }; });
    assert.deepEqual(urls, ['https://zenquotes.io/api/today']);
    assert.equal(quote, "Today's quote, from Aristotle: Well begun is half done.");
    await assert.rejects(fetchQuote(ok([])), /no quote/);
  });
});

describe('Kevo trivia', () => {
  it('understands trivia requests', () => {
    for (const said of ['trivia', "let's play trivia", 'quiz me', 'ask me a trivia question', 'give me another quiz question']) assert.equal(isTriviaRequest(said), true, said);
    for (const said of ['what is trivia', 'the quiz show was fun']) assert.equal(isTriviaRequest(said), false, said);
  });

  it('asks with lettered choices and checks the answer', async () => {
    const q = await fetchTrivia(ok(TRIVIA), () => 0.99);
    assert.equal(q.question, 'What is the capital of Kenya?');
    assert.equal(q.choices.length, 4);
    assert.ok(q.choices.includes('Nairobi'));
    const letter = 'ABCD'[q.choices.indexOf('Nairobi')];
    assert.match(askTrivia(q), /^A Geography question: What is the capital of Kenya\? Is it A, .+; B, .+; C, .+; or D, .+\?$/);
    assert.equal(answerTrivia(q, letter.toLowerCase()), "That's right! It's Nairobi.");
    assert.equal(answerTrivia(q, "I think it's nairobi"), "That's right! It's Nairobi.");
    assert.equal(answerTrivia(q, 'Mombasa'), `Not quite. The answer is ${letter}, Nairobi.`);
    assert.equal(answerTrivia(q, "I don't know"), `The answer is ${letter}, Nairobi.`);
    assert.equal(answerTrivia(q, 'play some music'), null);
  });

  it('takes the next reply as the answer, once', async () => {
    await withFetch(() => TRIVIA, async () => {
      const agent = new JarvisVoiceAgent({ switchView: () => {}, onlineLookupsEnabled: () => true });
      const asked = await agent.processVoiceInput('quiz me');
      assert.equal(asked.actionName, 'trivia');
      const answered = await agent.processVoiceInput('Nairobi');
      assert.equal(answered.actionName, 'trivia_answer');
      assert.equal(answered.speechReply, "That's right! It's Nairobi.");
      const after = await agent.processVoiceInput('Nairobi');
      assert.notEqual(after.actionName, 'trivia_answer');
    });
  });
});

describe('Kevo translation', () => {
  it('understands translation requests', () => {
    assert.deepEqual(parseTranslateRequest('translate good morning to swahili'), { text: 'good morning', language: 'Swahili', code: 'sw' });
    assert.deepEqual(parseTranslateRequest('can you translate "thank you" into french?'), { text: 'thank you', language: 'French', code: 'fr' });
    assert.deepEqual(parseTranslateRequest('how do you say where is the station in spanish'), { text: 'where is the station', language: 'Spanish', code: 'es' });
    for (const said of ['translate this to klingon', 'translate hello to english', 'how are you']) assert.equal(parseTranslateRequest(said), null, said);
  });

  it('asks MyMemory from English', async () => {
    const urls: string[] = [];
    const text = await translateFromEnglish('good morning', 'sw', async (url) => { urls.push(url); return { ok: true, status: 200, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Habari ya asubuhi' } }) }; });
    assert.deepEqual(urls, ['https://api.mymemory.translated.net/get?q=good%20morning&langpair=en%7Csw']);
    assert.equal(text, 'Habari ya asubuhi');
    await assert.rejects(translateFromEnglish('x', 'sw', ok({ responseStatus: 429, responseData: { translatedText: 'MYMEMORY WARNING' } })), /could not translate/);
  });

  it('answers through Kevo', async () => {
    await withFetch(() => ({ responseStatus: 200, responseData: { translatedText: 'Asante' } }), async () => {
      const res = await new JarvisVoiceAgent({ switchView: () => {}, onlineLookupsEnabled: () => true }).processVoiceInput('translate thank you to Swahili');
      assert.equal(res.actionName, 'translate');
      assert.equal(res.speechReply, 'In Swahili, thank you is: Asante');
    });
  });
});

describe('Kevo online extras stay off until online lookups are on', () => {
  it('sends nothing while off', async () => {
    await withFetch(() => ({}), async (urls) => {
      const agent = new JarvisVoiceAgent({ switchView: () => {}, onlineLookupsEnabled: () => false });
      for (const said of ['quote of the day', 'quiz me', 'translate hello to French']) {
        const res = await agent.processVoiceInput(said);
        assert.equal(res.speechReply, ONLINE_LOOKUPS_OFF, said);
        assert.equal(res.reason, 'ONLINE_LOOKUPS_OFF', said);
      }
      assert.deepEqual(urls, []);
    });
  });
});
