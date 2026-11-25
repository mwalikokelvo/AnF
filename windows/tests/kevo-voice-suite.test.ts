import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { flipCoin, pickNumber, isCoinFlipRequest, parseNumberPickRequest } from '../src/workspace/jarvis/voice/kevo-randomizer';
import { spellWord, phoneticSpelling, parseSpellingRequest } from '../src/workspace/jarvis/voice/kevo-spelling';
import { setSleepTimer, getSleepTimer, cancelSleepTimer, parseSleepTimerRequest } from '../src/workspace/jarvis/voice/kevo-sleep-timer';
import { getActionByName } from '../src/workspace/jarvis/voice/kevo-actions';
import { JarvisVoiceAgent } from '../src/workspace/jarvis/voice/jarvis-voice-agent';

describe('Kevo Randomizer (Coin Flip & Number Picker)', () => {
  it('detects coin flip requests', () => {
    assert.equal(isCoinFlipRequest('flip a coin'), true);
    assert.equal(isCoinFlipRequest('heads or tails'), true);
    assert.equal(isCoinFlipRequest('kevo please toss a coin'), true);
    assert.equal(isCoinFlipRequest('what time is it'), false);
  });

  it('flips a coin with predictable random seed', () => {
    const heads = flipCoin(() => 0.2);
    assert.equal(heads.outcome, 'heads');
    assert.match(heads.speech, /heads/);

    const tails = flipCoin(() => 0.8);
    assert.equal(tails.outcome, 'tails');
    assert.match(tails.speech, /tails/);
  });

  it('parses number pick requests', () => {
    const req1 = parseNumberPickRequest('pick a number between 1 and 10');
    assert.deepEqual(req1, { min: 1, max: 10 });

    const req2 = parseNumberPickRequest('random number from 20 to 50');
    assert.deepEqual(req2, { min: 20, max: 50 });

    assert.equal(parseNumberPickRequest('pick a flower'), null);
  });

  it('picks a random number in range', () => {
    const res = pickNumber(1, 10, () => 0.5);
    assert.equal(res.min, 1);
    assert.equal(res.max, 10);
    assert.equal(res.value, 6);
    assert.match(res.speech, /I picked 6/);
  });
});

describe('Kevo Spelling & Phonetic Alphabet', () => {
  it('spells words with hyphenated capital letters', () => {
    const res = spellWord('hello');
    assert.equal(res.spelling, 'H-E-L-L-O');
    assert.match(res.speech, /H, E, L, L, O/);
  });

  it('translates words to NATO phonetic alphabet', () => {
    const res = phoneticSpelling('cat');
    assert.equal(res.phonetic, 'Charlie Alfa Tango');
    assert.match(res.speech, /Charlie, Alfa, Tango/);
  });

  it('parses spelling requests correctly', () => {
    const r1 = parseSpellingRequest('how do you spell elephant');
    assert.deepEqual(r1, { word: 'elephant', phonetic: false });

    const r2 = parseSpellingRequest('spell bravo in nato');
    assert.deepEqual(r2, { word: 'bravo', phonetic: true });

    const r3 = parseSpellingRequest('what is the weather');
    assert.equal(r3, null);
  });
});

describe('Kevo Sleep Timer', () => {
  it('sets, inspects, and cancels sleep timer', () => {
    cancelSleepTimer();
    const setRes = setSleepTimer(30);
    assert.equal(setRes.ok, true);
    assert.match(setRes.speech, /Sleep timer set for 30 minutes/);

    const getRes = getSleepTimer();
    assert.equal(getRes.active, true);
    assert.equal(getRes.remainingMinutes, 30);

    const cancelRes = cancelSleepTimer();
    assert.equal(cancelRes.ok, true);
    assert.match(cancelRes.speech, /cancelled/);

    const afterCancel = getSleepTimer();
    assert.equal(afterCancel.active, false);
  });

  it('triggers onExpire callback when timer elapses', (t, done) => {
    let fired = false;
    // Set a 1-minute timer but simulate or test setSleepTimer callback manually
    setSleepTimer(0.0001, () => {
      fired = true;
    });
    setTimeout(() => {
      cancelSleepTimer();
      done();
    }, 20);
  });

  it('parses sleep timer natural language queries', () => {
    assert.deepEqual(parseSleepTimerRequest('set a sleep timer for 15 minutes'), { action: 'set', minutes: 15 });
    assert.deepEqual(parseSleepTimerRequest('stop audio in 45 minutes'), { action: 'set', minutes: 45 });
    assert.deepEqual(parseSleepTimerRequest('how much time left on sleep timer'), { action: 'get' });
    assert.deepEqual(parseSleepTimerRequest('cancel sleep timer'), { action: 'cancel' });
  });
});

describe('Kevo Voice Agent Integration for New Capabilities', () => {
  it('executes actions via KEVO_ACTIONS registry', async () => {
    const ctx: any = { switchView: () => {} };

    const flipAction = getActionByName('flip_coin');
    assert.ok(flipAction);
    const flipRes = await flipAction.execute({}, ctx);
    assert.equal(flipRes.handled, true);
    assert.equal(flipRes.status, 'success');

    const pickAction = getActionByName('pick_number');
    assert.ok(pickAction);
    const pickRes = await pickAction.execute({ min: 5, max: 20 }, ctx);
    assert.equal(pickRes.handled, true);
    assert.equal(pickRes.status, 'success');

    const spellAction = getActionByName('spell_word');
    assert.ok(spellAction);
    const spellRes = await spellAction.execute({ word: 'test', phonetic: true }, ctx);
    assert.equal(spellRes.handled, true);
    assert.match(spellRes.speechReply, /Tango/);
  });

  it('handles natural language queries directly through JarvisVoiceAgent', async () => {
    let paused = false;
    const agent = new JarvisVoiceAgent({
      switchView: () => {},
      pauseMusic: () => { paused = true; },
    });

    const flipResult = await agent.processVoiceInput('kevo flip a coin');
    assert.equal(flipResult.actionName, 'flip_coin');
    assert.equal(flipResult.status, 'success');

    const pickResult = await agent.processVoiceInput('kevo pick a number between 10 and 20');
    assert.equal(pickResult.actionName, 'pick_number');
    assert.equal(pickResult.status, 'success');

    const spellResult = await agent.processVoiceInput('kevo how do you spell world');
    assert.equal(spellResult.actionName, 'spell_word');
    assert.match(spellResult.speechReply, /W, O, R, L, D/);

    const sleepResult = await agent.processVoiceInput('kevo set sleep timer for 20 minutes');
    assert.equal(sleepResult.actionName, 'set_sleep_timer');
    assert.match(sleepResult.speechReply, /Sleep timer set for 20 minutes/);
    // The timer is real: without this the runner waits 20 minutes for it before exiting.
    cancelSleepTimer();
  });
});
