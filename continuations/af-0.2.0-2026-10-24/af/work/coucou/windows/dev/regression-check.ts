import { State } from '../src/core/state';
import { Ticker } from '../src/views/ticker';
import { strict as assert } from 'node:assert';

class ElementStub {
  style: Record<string, string> = {};
  textContent = '';
  children: ElementStub[] = [];
  setAttribute() {}
  append(...children: ElementStub[]) { this.children.push(...children); }
}
(globalThis as any).document = {
  createElement: () => new ElementStub(),
  createElementNS: () => new ElementStub(),
  createTextNode: (text: string) => Object.assign(new ElementStub(), { textContent: text }),
};
State.upsertExternalAgent('regression-agent', 'Regression', '#fff');
const task = State.tasks.find(t => t.id === 'regression-agent')!;
const ticker = new Ticker();
for (let i = 0; i < 45; i++) {
  State.appendStep(task.id, `step ${i}`);
  ticker.sync(task);
  ticker.tick(i * 2000);
  ticker.tick(i * 2000 + 1500);
}
assert.equal(task.steps.length, 20);
assert.equal(task.stepIndex, 44);
assert.equal((ticker as any).b.text, 'step 44');
assert.equal(ticker.animating, false);
const other = { ...task, id: 'other', steps: ['new session'], stepIndex: 0 };
ticker.sync(other);
assert.equal((ticker as any).b.text, 'new session');
State.appendStep(task.id, 'a very long command '.repeat(100));
ticker.sync(task);
assert.equal((ticker as any).b.el.title, 'a very long command '.repeat(100));
console.log('PASS: ticker continues after 20 steps, transitions finish, switching sessions reseeds, full labels remain available.');
