/**
 * Kevo Schedule and Reminders (Phase 4 Step 4.1).
 * Interfaces with native schedule engine via Bridge, falling back to local memory in headless tests.
 */

import { Bridge } from '../../../core/bridge.js';

export interface KevoReminder {
  id: string;
  message: string;
  trigger_at: number;
  created_at: number;
  fired: boolean;
  recurring?: string;
}

const STORAGE_KEY_REMINDERS = 'kevo_schedule_reminders';
let localReminders: KevoReminder[] = [];

function hasTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__);
}

function loadLocalStore(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY_REMINDERS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) localReminders = parsed;
      }
    }
  } catch {
    /* fallback to memory */
  }
}

function persistLocalStore(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_REMINDERS, JSON.stringify(localReminders));
    }
  } catch {
    /* ignore storage quota errors */
  }
}

loadLocalStore();

export async function createReminder(
  message: string,
  trigger_at: number,
  recurring?: string
): Promise<KevoReminder> {
  const clean = message.trim();
  if (!clean) throw new Error('Reminder message cannot be empty');

  try {
    if (hasTauri() && typeof Bridge.kevoScheduleCreateReminder === 'function') {
      const res = await Bridge.kevoScheduleCreateReminder(clean, trigger_at, recurring);
      if (res && res.id) {
        localReminders.push(res);
        persistLocalStore();
        return res;
      }
    }
  } catch {
    /* fallback to localReminders */
  }

  const now = Date.now();
  const reminder: KevoReminder = {
    id: `rem_${now}_${Math.floor(Math.random() * 100000)}`,
    message: clean,
    trigger_at,
    created_at: now,
    fired: false,
    recurring: recurring?.trim().toLowerCase(),
  };

  localReminders.push(reminder);
  persistLocalStore();
  return reminder;
}

export async function listReminders(include_fired = false): Promise<KevoReminder[]> {
  try {
    if (hasTauri() && typeof Bridge.kevoScheduleListReminders === 'function') {
      const res = await Bridge.kevoScheduleListReminders(include_fired);
      if (Array.isArray(res)) {
        localReminders = res;
        persistLocalStore();
        return res;
      }
    }
  } catch {
    /* fallback to localReminders */
  }

  if (include_fired) return [...localReminders];
  return localReminders.filter((r) => !r.fired);
}

export async function cancelReminder(idOrQuery: string): Promise<boolean> {
  const target = idOrQuery.trim().toLowerCase();
  if (!target) return false;

  try {
    if (hasTauri() && typeof Bridge.kevoScheduleCancelReminder === 'function') {
      const res = await Bridge.kevoScheduleCancelReminder(idOrQuery);
      localReminders = localReminders.filter(
        (r) => r.id !== idOrQuery && !r.message.toLowerCase().includes(target)
      );
      persistLocalStore();
      return Boolean(res);
    }
  } catch {
    /* fallback to localReminders */
  }

  const initialLen = localReminders.length;
  localReminders = localReminders.filter(
    (r) => r.id !== idOrQuery && !r.message.toLowerCase().includes(target)
  );
  const changed = localReminders.length !== initialLen;
  if (changed) persistLocalStore();
  return changed;
}

export async function clearReminders(): Promise<boolean> {
  try {
    if (hasTauri() && typeof Bridge.kevoScheduleClearReminders === 'function') {
      const res = await Bridge.kevoScheduleClearReminders();
      localReminders = [];
      persistLocalStore();
      return Boolean(res);
    }
  } catch {
    /* fallback to localReminders */
  }

  const had = localReminders.length > 0;
  localReminders = [];
  persistLocalStore();
  return had;
}

export async function checkDueReminders(nowMs = Date.now()): Promise<KevoReminder[]> {
  try {
    if (hasTauri() && typeof Bridge.kevoScheduleCheckDue === 'function') {
      const res = await Bridge.kevoScheduleCheckDue();
      if (Array.isArray(res)) return res;
    }
  } catch {
    /* fallback to localReminders */
  }

  const fired: KevoReminder[] = [];
  for (const r of localReminders) {
    if (!r.fired && r.trigger_at <= nowMs) {
      r.fired = true;
      fired.push({ ...r });
      if (r.recurring === 'daily') {
        localReminders.push({
          id: `rem_${nowMs}_${Math.floor(Math.random() * 100000)}`,
          message: r.message,
          trigger_at: r.trigger_at + 86400000,
          created_at: nowMs,
          fired: false,
          recurring: 'daily',
        });
      }
    }
  }

  if (fired.length > 0) persistLocalStore();
  return fired;
}
