/**
 * Kevo Time-To-First-Sentence (TTFS) Telemetry & Live HUD Badge Tests (Phase 6 Step 6.4)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatModelDisplayName, formatTtfsBadge, createJarvisCommandDesk } from '../src/workspace/jarvis/jarvis-command-desk';
import { createJarvisHud } from '../src/workspace/jarvis/jarvis-hud';

class FakeEl {
  children: FakeEl[] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
  className = ''; textContent = ''; innerHTML = ''; value = ''; hidden = false; disabled = false;
  constructor(public tag: string) {}
  append(...c: (FakeEl | string)[]) {
    for (const item of c) {
      if (typeof item === 'string') {
        const textNode = new FakeEl('span');
        textNode.textContent = item;
        this.children.push(textNode);
      } else {
        this.children.push(item);
      }
    }
  }
  prepend(...c: (FakeEl | string)[]) {
    for (const item of c.reverse()) {
      if (typeof item === 'string') {
        const textNode = new FakeEl('span');
        textNode.textContent = item;
        this.children.unshift(textNode);
      } else {
        this.children.unshift(item);
      }
    }
  }
  appendChild(c: FakeEl) { this.children.push(c); return c; }
  replaceChildren(...c: FakeEl[]) { this.children = c; }
  setAttribute(k: string, v: string) { (this as any)[k] = v; }
  remove() {}
  get lastElementChild() { return this.children[this.children.length - 1] ?? null; }
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  fire(type: string, event: any = { preventDefault() {} }) { for (const fn of this.listeners[type] ?? []) fn(event); }
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

function setupDom() {
  const rec = new FakeRecognition();
  const g = globalThis as any;
  g.window = {
    SpeechRecognition: function SpeechRecognition() { return rec; },
    matchMedia: () => ({ matches: false }),
  };
  g.document = {
    createElement: (tag: string) => new FakeEl(tag),
    getElementById: () => null,
    head: new FakeEl('head'),
  };
  return { rec };
}

describe('Kevo TTFS Telemetry & Model Formatting', () => {
  it('formats model display names accurately across model tiers', () => {
    assert.strictEqual(formatModelDisplayName('deepseek-v4-pro-qwen3.5-9b'), 'DeepSeek V4 Pro 9B');
    assert.strictEqual(formatModelDisplayName('fast'), 'Qwen 0.6B Q8');
    assert.strictEqual(formatModelDisplayName('balanced'), 'Qwen 1.7B Q8');
    assert.strictEqual(formatModelDisplayName('qwen3-0.6b-fast'), 'Qwen 0.6B Q8');
    assert.strictEqual(formatModelDisplayName('qwen3-1.7b-balanced'), 'Qwen 1.7B Q8');
    assert.strictEqual(formatModelDisplayName('deepseek-r1-distill-qwen-1.5b'), 'DeepSeek R1');
    assert.strictEqual(formatModelDisplayName('kimi-linear-a3b'), 'Kimi Linear');
    assert.strictEqual(formatModelDisplayName(undefined), 'DeepSeek V4 Pro 9B');
  });

  it('formats TTFS HUD badge string truthfully with seconds and model name', () => {
    assert.strictEqual(
      formatTtfsBadge(1800, 'Qwen 1.7B Q8'),
      'First sentence: 1.8 s (Model: Qwen 1.7B Q8)'
    );
    assert.strictEqual(
      formatTtfsBadge(940, 'Qwen 0.6B Q8'),
      'First sentence: 0.9 s (Model: Qwen 0.6B Q8)'
    );
    assert.strictEqual(
      formatTtfsBadge(3210, 'DeepSeek R1'),
      'First sentence: 3.2 s (Model: DeepSeek R1)'
    );
  });

  it('updates Command Desk HUD badge element dynamically', () => {
    setupDom();

    const hud = createJarvisHud();
    assert.ok(hud.setBadge, 'createJarvisHud returns setBadge');

    const badgeEl = (hud.root as any).children?.[0]?.children?.find?.((c: any) =>
      c.className && c.className.includes('kevo-badge')
    );
    assert.ok(badgeEl, 'kevo-badge element exists in stage');
    assert.strictEqual(badgeEl.hidden, true, 'badge is initially hidden');

    hud.setBadge('First sentence: 1.8 s (Model: Qwen 1.7B Q8)');
    assert.strictEqual(badgeEl.textContent, 'First sentence: 1.8 s (Model: Qwen 1.7B Q8)');
    assert.strictEqual(badgeEl.hidden, false, 'badge is visible when text is set');

    hud.setBadge('');
    assert.strictEqual(badgeEl.hidden, true, 'badge is hidden when cleared');
  });

  it('captures TTFS telemetry and sets badge upon first sentence stream', async () => {
    const { rec } = setupDom();
    const logged: any[] = [];
    let floatBadge = '';

    const desk = createJarvisCommandDesk({
      log: {
        append: async (entry) => { logged.push(entry); },
        save: async () => '',
        openFolder: async () => {},
      },
      activeModel: () => 'balanced',
      voiceActionContext: {
        setFloatBadge: (b) => { floatBadge = b; },
        askAI: async (query, opts) => {
          opts?.onPart?.('First sentence is streamed.');
          opts?.onPart?.('Second sentence is here.');
          return { text: 'First sentence is streamed. Second sentence is here.', actionName: 'ai_conversation' };
        },
      },
    });

    const root = desk.root as unknown as FakeEl;
    const form = root.find((el) => el.className === 'jarvis-type')!;
    assert.ok(form, 'typing form exists');

    form.children[0].value = 'Explain the speed of light in deep space';
    form.fire('submit');

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 50));

    const ttfsLog = logged.find((entry) => entry.type === 'ttfs');
    assert.ok(ttfsLog, 'ttfs event was logged');
    assert.strictEqual(ttfsLog.model, 'Qwen 1.7B Q8');
    assert.strictEqual(typeof ttfsLog.ms, 'number');
    assert.ok(ttfsLog.ms >= 0);

    assert.ok(floatBadge.startsWith('First sentence:'), 'float badge was set');
    assert.ok(floatBadge.includes('Model: Qwen 1.7B Q8'));

    const badgeEl = root.find((el) => el.className.includes('kevo-badge'));
    assert.ok(badgeEl, 'kevo-badge element found');
    assert.strictEqual(badgeEl.hidden, false);
    assert.strictEqual(badgeEl.textContent, floatBadge);

    desk.destroy();
  });
});
