/**
 * Kevo's log (Phase 0 step 0.1): an ignored phrase and an answered request each write one line.
 * Trimming the file is tested in Rust (`log::tests`). A small stand-in DOM lets the real command desk run.
 */
import { describe, it, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvisCommandDesk } from '../src/workspace/jarvis/jarvis-command-desk';
import { JarvisVoiceListener } from '../src/workspace/jarvis/voice/jarvis-voice-listener';
import { createKevoLog } from '../src/workspace/jarvis/kevo-log';

class FakeEl {
  children: FakeEl[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
  className = ''; textContent = ''; innerHTML = ''; value = ''; hidden = false; disabled = false;
  constructor(public tag: string) {}
  append(...c: FakeEl[]) { this.children.push(...c); }
  prepend(...c: FakeEl[]) { this.children.unshift(...c); }
  appendChild(c: FakeEl) { this.children.push(c); return c; }
  replaceChildren(...c: FakeEl[]) { this.children = c; }
  setAttribute() {}
  remove() {}
  get lastElementChild() { return this.children[this.children.length - 1] ?? null; }
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  fire(type: string) { for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {} }); }
  find(test: (el: FakeEl) => boolean): FakeEl | undefined {
    if (test(this)) return this;
    for (const c of this.children) { const hit = c.find(test); if (hit) return hit; }
    return undefined;
  }
}

class FakeRecognition {
  onstart?: () => void; onend?: () => void; onresult?: (e: unknown) => void; onerror?: (e: unknown) => void;
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  say(transcript: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] });
  }
}

const g = globalThis as any;
const saved = { window: g.window, document: g.document };
afterEach(() => { mock.timers.reset(); g.window = saved.window; g.document = saved.document; });

function setup() {
  const rec = new FakeRecognition();
  g.window = { SpeechRecognition: function SpeechRecognition() { return rec; } };
  g.document = { createElement: (tag: string) => new FakeEl(tag), getElementById: () => null, head: new FakeEl('head') };
  const lines: Record<string, unknown>[] = [];
  const desk = createJarvisCommandDesk({
    log: { append: async (entry) => { lines.push(entry); }, save: async () => '', openFolder: async () => {} },
  });
  const root = desk.root as unknown as FakeEl;
  return { desk, rec, lines, root };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("Kevo's log", () => {
  it('an answered request writes one line with its text, action, reply and timing', async () => {
    const { desk, lines, root } = setup();
    const form = root.find((el) => el.className === 'jarvis-type')!;
    form.children[0].value = 'what can you do';
    form.fire('submit');
    await settle(); await settle();
    assert.equal(lines.length, 1);
    const [line] = lines;
    assert.equal(line.event, 'request');
    assert.equal(line.text, 'what can you do');
    assert.equal(line.actionName, 'help');
    assert.match(String(line.reply), /^I can open apps/);
    assert.equal(typeof line.ms, 'number');
    assert.ok(!Number.isNaN(Date.parse(String(line.t))));
    desk.destroy();
  });

  it("Kevo's own reply heard back is one ignored line with reason own_voice", async () => {
    const { desk, rec, lines, root } = setup();
    const form = root.find((el) => el.className === 'jarvis-type')!;
    form.children[0].value = 'what can you do';
    form.fire('submit');
    await settle(); await settle();
    root.find((el) => el.className === 'jarvis-mic-btn')!.fire('click'); // mic on: no wake word needed yet
    lines.length = 0;
    await new Promise((r) => setTimeout(r, 1200)); // the listener waits for a pause before acting
    rec.say('play or pause music change the volume');
    await new Promise((r) => setTimeout(r, 1200));
    assert.deepEqual(lines.map((l) => [l.event, l.reason, l.text]), [['ignored', 'own_voice', 'play or pause music change the volume']]);
    desk.destroy();
  });

  it('the listener reports room talk without the wake word, and muted speech, as ignored', () => {
    const rec = new FakeRecognition();
    g.window = { SpeechRecognition: function SpeechRecognition() { return rec; } };
    const lines: Record<string, unknown>[] = [];
    const log = createKevoLog(async (entry) => { lines.push(entry); });
    const listener = new JarvisVoiceListener({ followUpMs: 0, settleMs: 0, onIgnored: (text, reason) => log('ignored', { text, reason }) });
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    listener.start(); // the mic tap's follow-up window (0 ms here) closed long before the room talk
    mock.timers.tick(60_000);
    rec.say('Hey Google, what is the weather');
    assert.deepEqual(lines.map((l) => [l.event, l.reason, l.text]), [['ignored', 'no_wake_word', 'Hey Google, what is the weather']]);
    listener.setMuted(true);
    rec.say('Kevo, it is 9 pm, sir.');
    assert.deepEqual(lines.map((l) => l.reason), ['no_wake_word', 'muted']);
    listener.stop();
  });

  it('a phrase just after the follow-up window closed is ignored as window_closed', async () => {
    const rec = new FakeRecognition();
    g.window = { SpeechRecognition: function SpeechRecognition() { return rec; } };
    const reasons: string[] = [];
    const listener = new JarvisVoiceListener({ followUpMs: 5, settleMs: 0, onIgnored: (_t, reason) => reasons.push(reason) });
    listener.start(); // the mic tap opens the follow-up window
    await new Promise((r) => setTimeout(r, 20));
    rec.say('set a timer for one minute');
    assert.deepEqual(reasons, ['window_closed']);
    listener.stop();
  });

  it('a log that cannot be written never breaks Kevo', async () => {
    const log = createKevoLog(() => Promise.reject(new Error('disk full')));
    assert.doesNotThrow(() => log('mic', { on: true }));
    const throwing = createKevoLog(() => { throw new Error('no Tauri'); });
    assert.doesNotThrow(() => throwing('stop'));
    await settle();
  });
});
