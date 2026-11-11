import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendJarvisTurn,
  clearJarvisHistory,
  formatJarvisHistoryForPrompt,
  getJarvisHistory,
} from '../src/workspace/jarvis/voice/jarvis-memory.js';

describe('JARVIS conversational memory', () => {
  beforeEach(() => {
    clearJarvisHistory();
  });

  it('stores turns and formats a prompt transcript', () => {
    appendJarvisTurn('user', 'What time is rehearsal?');
    appendJarvisTurn('assistant', 'I do not have your calendar, sir.');
    const hist = getJarvisHistory();
    assert.equal(hist.length, 2);
    const prompt = formatJarvisHistoryForPrompt();
    assert.match(prompt, /User: What time is rehearsal\?/);
    assert.match(prompt, /JARVIS: I do not have your calendar/);
  });

  it('keeps only the last 20 turns', () => {
    for (let i = 0; i < 25; i++) {
      appendJarvisTurn('user', `msg-${i}`);
      appendJarvisTurn('assistant', `ack-${i}`);
    }
    assert.equal(getJarvisHistory().length, 20);
    assert.equal(getJarvisHistory()[0].text, 'msg-15');
  });
});
