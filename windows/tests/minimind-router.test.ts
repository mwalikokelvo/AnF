import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyKevoIntent } from '../src/workspace/jarvis/voice/minimind-router';

describe('MiniMind Fast Intent Router', () => {
  it('instantly classifies time and date queries', () => {
    const t = classifyKevoIntent("what's the time");
    assert.equal(t.intent, 'TELL_TIME');
    assert.equal(t.isInstantCommand, true);

    const d = classifyKevoIntent("what's today's date");
    assert.equal(d.intent, 'TELL_DATE');
    assert.equal(d.isInstantCommand, true);
  });

  it('instantly classifies music control commands', () => {
    const wp = classifyKevoIntent("what's playing");
    assert.equal(wp.intent, 'WHATS_PLAYING');
    assert.equal(wp.isInstantCommand, true);

    const pause = classifyKevoIntent('pause music');
    assert.equal(pause.intent, 'MUSIC_PAUSE');

    const next = classifyKevoIntent('next track');
    assert.equal(next.intent, 'MUSIC_NEXT');
  });

  it('extracts slots for timer and reminder commands', () => {
    const timer = classifyKevoIntent('set a timer for 15 minutes');
    assert.equal(timer.intent, 'TIMER_SET');
    assert.equal(timer.slots.amount, '15');
    assert.equal(timer.slots.unit, 'minutes');

    const reminder = classifyKevoIntent('remind me in 2 hours to review pull request');
    assert.equal(reminder.intent, 'REMINDER_CREATE');
    assert.equal(reminder.slots.timeframe, '2 hours');
    assert.equal(reminder.slots.task, 'review pull request');
  });

  it('classifies transcribe command with video URL', () => {
    const trans = classifyKevoIntent('transcribe https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(trans.intent, 'TRANSCRIBE_VIDEO');
    assert.equal(trans.slots.url, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('routes open-ended philosophical or complex queries to DEEP_CHAT', () => {
    const chat = classifyKevoIntent('Why is the sky blue and how do atmospheric particles scatter light?');
    assert.equal(chat.intent, 'DEEP_CHAT');
    assert.equal(chat.isInstantCommand, false);
  });
});
