/**
 * Kevo Alarms: "set an alarm for 7 AM", "wake me at 6:30".
 * Uses the existing reminder system under the hood for persistence.
 */

import { bareRequest } from './kevo-fun';

export function parseAlarmRequest(lower: string): { hour: number; minute: number } | null {
  const said = bareRequest(lower);
  const m = /^(?:set (?:an |the )?alarm(?: for)?|wake me(?: up)? at|alarm at) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(said);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3];
  if (meridiem === 'pm' && hour < 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function formatAlarmTime(hour: number, minute: number): string {
  const h = hour % 12 || 12;
  const m = minute.toString().padStart(2, '0');
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h}:${m} ${ampm}`;
}
