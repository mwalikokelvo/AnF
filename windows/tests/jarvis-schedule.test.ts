import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createReminder,
  listReminders,
  cancelReminder,
  clearReminders,
  checkDueReminders,
  parseTimeOfDay,
  calculateNextDailyOccurrence,
  formatTimeOfDay,
  scheduleDailyBriefing,
  getDailyBriefingSchedule,
  cancelDailyBriefingSchedule,
  triggerReminderAlert,
  playWebAlertChime,
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

  describe('Daily Briefing Scheduler (Phase 4 Step 4.3)', () => {
    it('parses valid time of day strings and rejects malformed formats', () => {
      assert.deepStrictEqual(parseTimeOfDay('8 AM'), { hours: 8, minutes: 0 });
      assert.deepStrictEqual(parseTimeOfDay('8:00 AM'), { hours: 8, minutes: 0 });
      assert.deepStrictEqual(parseTimeOfDay('8am'), { hours: 8, minutes: 0 });
      assert.deepStrictEqual(parseTimeOfDay('8:30 PM'), { hours: 20, minutes: 30 });
      assert.deepStrictEqual(parseTimeOfDay('14:45'), { hours: 14, minutes: 45 });
      assert.deepStrictEqual(parseTimeOfDay('noon'), { hours: 12, minutes: 0 });
      assert.deepStrictEqual(parseTimeOfDay('midnight'), { hours: 0, minutes: 0 });

      assert.strictEqual(parseTimeOfDay('invalid'), null);
      assert.strictEqual(parseTimeOfDay('25:00'), null);
      assert.strictEqual(parseTimeOfDay('8:61'), null);
    });

    it('calculates the next daily occurrence timestamp accurately', () => {
      // 7:00 AM base date
      const base1 = new Date(2026, 10, 18, 7, 0, 0);
      const next1 = calculateNextDailyOccurrence(8, 0, base1);
      const targetDate1 = new Date(next1);
      assert.strictEqual(targetDate1.getDate(), 18);
      assert.strictEqual(targetDate1.getHours(), 8);

      // 9:00 AM base date (already past 8 AM today)
      const base2 = new Date(2026, 10, 18, 9, 0, 0);
      const next2 = calculateNextDailyOccurrence(8, 0, base2);
      const targetDate2 = new Date(next2);
      assert.strictEqual(targetDate2.getDate(), 19);
      assert.strictEqual(targetDate2.getHours(), 8);
    });

    it('formats time of day correctly for UI and speech display', () => {
      assert.strictEqual(formatTimeOfDay(8, 0), '8:00 AM');
      assert.strictEqual(formatTimeOfDay(14, 30), '2:30 PM');
      assert.strictEqual(formatTimeOfDay(0, 15), '12:15 AM');
      assert.strictEqual(formatTimeOfDay(12, 0), '12:00 PM');
    });

    it('schedules, queries, replaces, and cancels recurring daily briefing', async () => {
      // Initially none
      assert.strictEqual(await getDailyBriefingSchedule(), null);

      // Schedule at 8:00 AM
      const scheduled = await scheduleDailyBriefing('8:00 AM');
      assert.ok(scheduled.id.startsWith('rem_'));
      assert.strictEqual(scheduled.recurring, 'daily');
      assert.match(scheduled.message, /Daily briefing/);

      const active = await getDailyBriefingSchedule();
      assert.ok(active);
      assert.strictEqual(active.id, scheduled.id);

      // Reschedule at 9:30 AM replaces earlier schedule
      const rescheduled = await scheduleDailyBriefing('9:30 AM');
      const allReminders = await listReminders();
      const briefingReminders = allReminders.filter((r) => r.message.toLowerCase().includes('briefing'));
      assert.strictEqual(briefingReminders.length, 1);
      assert.strictEqual(briefingReminders[0].id, rescheduled.id);

      // Cancel briefing schedule
      const cancelled = await cancelDailyBriefingSchedule();
      assert.strictEqual(cancelled, true);
      assert.strictEqual(await getDailyBriefingSchedule(), null);
    });
  });

  describe('Minimised Window Alert & Audio Notification (Phase 4 Step 4.4)', () => {
    it('executes triggerReminderAlert invoking Bridge and desktop notification gracefully', async () => {
      let alertedTitle = '';
      let alertedMessage = '';
      const orig = Bridge.kevoScheduleTriggerAlert;
      const origWindow = (globalThis as any).window;
      try {
        (globalThis as any).window = {
          __TAURI__: { core: { invoke: async () => {} } },
        };
        Bridge.kevoScheduleTriggerAlert = async (title: string, msg: string) => {
          alertedTitle = title;
          alertedMessage = msg;
        };

        await triggerReminderAlert('Kevo Reminder', 'Check the server logs');
        assert.strictEqual(alertedTitle, 'Kevo Reminder');
        assert.strictEqual(alertedMessage, 'Check the server logs');
      } finally {
        Bridge.kevoScheduleTriggerAlert = orig;
        (globalThis as any).window = origWindow;
      }
    });

    it('plays web alert chime safely in headless environments without errors', () => {
      assert.doesNotThrow(() => {
        playWebAlertChime();
      });
    });
  });
});
