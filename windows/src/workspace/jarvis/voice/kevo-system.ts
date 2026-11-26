/**
 * Simple system status helpers for Kevo.
 * Battery and free disk use Tauri commands when available; otherwise graceful offline reply.
 */

import { bareRequest } from './kevo-fun';

export function isBatteryRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:(?:how(?:'s| is) (?:the )?battery|battery (?:level|status)|what(?:'s| is) the battery))$/.test(said);
}

export function isDiskRequest(lower: string): boolean {
  const said = bareRequest(lower);
  return /^(?:(?:how much (?:disk|storage|space)|disk space|free space|storage left))$/.test(said);
}

/** Placeholder that can be wired to Tauri invoke later. */
export async function getBatteryStatus(): Promise<string> {
  // In a full build this would call a Tauri command that uses sysinfo or Windows API.
  // For now return a friendly offline message so the command is recognized.
  return 'Battery status needs a native helper. On a laptop I can report it once that is wired in.';
}

export async function getDiskStatus(): Promise<string> {
  return 'Disk space check needs a native helper. I can add that on the next native pass.';
}
