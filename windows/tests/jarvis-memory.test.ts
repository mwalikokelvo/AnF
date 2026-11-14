import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendJarvisTurn,
  clearJarvisHistory,
  formatJarvisHistoryForPrompt,
  getJarvisHistory,
  healHistory,
} from '../src/workspace/jarvis/voice/jarvis-memory.js';

describe('Kevo conversational memory', () => {
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
    assert.match(prompt, /Kevo: I do not have your calendar/);
  });

  it('drops a saved history where Kevo answered itself in a loop, and keeps ordinary repeats', () => {
    const turn = (role: 'user' | 'assistant', text: string) => ({ role, text, at: 0 });
    const long = 'I see that you are having trouble with the offline runtime. Could you check the system requirements again?';
    assert.deepEqual(healHistory([turn('user', 'hi'), turn('assistant', long), turn('user', long), turn('assistant', long)]), []);
    const normal = [turn('user', 'a'), turn('assistant', 'I do not have your calendar, sir.'), turn('user', 'b'), turn('assistant', 'I do not have your calendar, sir.')];
    assert.equal(healHistory(normal), normal);
    const apart = [turn('assistant', long), turn('assistant', 'Something else entirely.'), turn('assistant', long)];
    assert.equal(healHistory(apart), apart);
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
