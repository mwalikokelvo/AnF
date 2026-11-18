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

  if (fired.length > 0) {
    persistLocalStore();
    for (const rem of fired) {
      void triggerReminderAlert('Kevo Reminder', rem.message);
    }
  }
  return fired;
}

// ─────────────────────────────────────────────────────────────
// Minimised Window Alert & Audio Notification (Phase 4 Step 4.4)
// ─────────────────────────────────────────────────────────────

export function playWebAlertChime(): void {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.15); // A5
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch {
    /* ignore audio errors in restricted/headless test contexts */
  }
}

export async function triggerReminderAlert(title: string, message: string): Promise<void> {
  playWebAlertChime();
  try {
    if (hasTauri() && typeof Bridge.kevoScheduleTriggerAlert === 'function') {
      await Bridge.kevoScheduleTriggerAlert(title, message);
    }
  } catch {
    /* fallback to desktop notification */
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body: message });
    } catch {
      /* ignore */
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Daily Briefing Scheduler (Phase 4 Step 4.3)
// ─────────────────────────────────────────────────────────────

export function parseTimeOfDay(timeStr: string): { hours: number; minutes: number } | null {
  const clean = timeStr.trim().toLowerCase();
  if (clean === 'noon') return { hours: 12, minutes: 0 };
  if (clean === 'midnight') return { hours: 0, minutes: 0 };

  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(clean);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toLowerCase();

  if (minutes < 0 || minutes > 59) return null;

  if (period === 'pm' && hours < 12) {
    hours += 12;
  } else if (period === 'am' && hours === 12) {
    hours = 0;
  }

  if (hours < 0 || hours > 23) return null;

  return { hours, minutes };
}

export function calculateNextDailyOccurrence(hours: number, minutes: number, fromDate = new Date()): number {
  const target = new Date(fromDate.getTime());
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= fromDate.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function formatTimeOfDay(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${displayHours}:${displayMinutes} ${period}`;
}

export async function scheduleDailyBriefing(timeStr: string, fromDate = new Date()): Promise<KevoReminder> {
  const parsed = parseTimeOfDay(timeStr);
  if (!parsed) {
    throw new Error(`Invalid time of day: "${timeStr}". Please specify a valid time, e.g. "8:00 AM".`);
  }
  // Cancel any existing daily briefing schedule
  await cancelDailyBriefingSchedule();

  const triggerAt = calculateNextDailyOccurrence(parsed.hours, parsed.minutes, fromDate);
  const timeLabel = formatTimeOfDay(parsed.hours, parsed.minutes);
  const reminder = await createReminder(`Daily briefing (${timeLabel})`, triggerAt, 'daily');
  return reminder;
}

export async function getDailyBriefingSchedule(): Promise<KevoReminder | null> {
  const reminders = await listReminders();
  const found = reminders.find(
    (r) => !r.fired && r.recurring === 'daily' && r.message.toLowerCase().includes('briefing')
  );
  return found || null;
}

export async function cancelDailyBriefingSchedule(): Promise<boolean> {
  const reminders = await listReminders();
  const briefingReminders = reminders.filter(
    (r) => !r.fired && r.message.toLowerCase().includes('briefing') && r.recurring === 'daily'
  );
  if (briefingReminders.length === 0) return false;
  for (const r of briefingReminders) {
    await cancelReminder(r.id);
  }
  return true;
}
