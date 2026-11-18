import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReminder,
  listReminders,
  cancelReminder,
  clearReminders,
  checkDueReminders,
  type KevoReminder,
} from '../src/workspace/jarvis/voice/jarvis-schedule.js';
import { Bridge } from '../src/core/bridge.js';

describe('Kevo persistent schedule store', () => {
  beforeEach(async () => {
    await clearReminders();
  });

  it('creates reminders, lists active ones, and sets timestamps correctly', async () => {
    const triggerAt = Date.now() + 60000;
    const rem = await createReminder('Check the oven', triggerAt);

    assert.strictEqual(rem.message, 'Check the oven');
    assert.strictEqual(rem.trigger_at, triggerAt);
    assert.strictEqual(rem.fired, false);
    assert.ok(rem.id.startsWith('rem_'));

    const list = await listReminders();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, rem.id);
  });

  it('cancels reminders by ID and by query text', async () => {
    const r1 = await createReminder('Call accountant', Date.now() + 10000);
    const r2 = await createReminder('Water the plants', Date.now() + 20000);
    assert.strictEqual((await listReminders()).length, 2);

    const cancelledById = await cancelReminder(r1.id);
    assert.strictEqual(cancelledById, true);
    let list = await listReminders();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].id, r2.id);

    const cancelledByQuery = await cancelReminder('plants');
    assert.strictEqual(cancelledByQuery, true);
    list = await listReminders();
    assert.strictEqual(list.length, 0);
  });

  it('clears all reminders', async () => {
    await createReminder('Task 1', Date.now() + 1000);
    await createReminder('Task 2', Date.now() + 2000);
    assert.strictEqual((await listReminders()).length, 2);

    const cleared = await clearReminders();
    assert.strictEqual(cleared, true);
    assert.strictEqual((await listReminders()).length, 0);
  });

  it('fires due reminders once and creates next occurrence for daily recurring items', async () => {
    const now = 1000000;
    await createReminder('Due one-shot', now - 5000);
    await createReminder('Daily report', now - 1000, 'daily');
    await createReminder('Future task', now + 50000);

    const fired = await checkDueReminders(now);
    assert.strictEqual(fired.length, 2);
    assert.ok(fired.some((r) => r.message === 'Due one-shot'));
    assert.ok(fired.some((r) => r.message === 'Daily report'));

    // Second check at same time should not fire again (single-fire guarantee)
    const firedAgain = await checkDueReminders(now + 100);
    assert.strictEqual(firedAgain.length, 0);

    // Active list should have future task + next day's daily report
    const active = await listReminders();
    assert.strictEqual(active.length, 2);
    assert.ok(active.some((r) => r.message === 'Future task'));
    assert.ok(active.some((r) => r.message === 'Daily report' && r.trigger_at === now - 1000 + 86400000));
  });

  it('syncs with native Bridge when available and recovers gracefully on error', async () => {
    const orig = Bridge.kevoScheduleListReminders;
    const origWindow = (globalThis as any).window;
    try {
      (globalThis as any).window = {
        __TAURI__: { core: { invoke: async () => {} } },
      };
      Bridge.kevoScheduleListReminders = async () => [
        { id: 'rem_bridge_1', message: 'Bridge task', trigger_at: 12345, created_at: 1000, fired: false },
      ];
      const res = await listReminders();
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].id, 'rem_bridge_1');

      // Bridge throws error: should fall back without crashing
      Bridge.kevoScheduleListReminders = async () => {
        throw new Error('Bridge error');
      };
      const fallback = await listReminders();
      assert.ok(Array.isArray(fallback));
    } finally {
      Bridge.kevoScheduleListReminders = orig;
      (globalThis as any).window = origWindow;
    }
  });
});
