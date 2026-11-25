/**
 * Sleep Timer manager for audio/music playback in Kevo.
 * Inspired by Spotify and ElevenReader sleep timer workflows.
 * Supports setting a countdown in minutes, checking remaining time, and cancelling.
 */

import { bareRequest } from './kevo-fun';

export interface SleepTimerState {
  active: boolean;
  durationMinutes: number;
  endsAt: number;
}

let activeTimeout: ReturnType<typeof setTimeout> | null = null;
let currentTimer: SleepTimerState | null = null;

export function setSleepTimer(
  minutes: number,
  onExpire?: () => void
): { ok: boolean; speech: string; timer: SleepTimerState } {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return {
      ok: false,
      speech: 'Please specify a valid duration in minutes for the sleep timer, sir.',
      timer: { active: false, durationMinutes: 0, endsAt: 0 },
    };
  }

  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }

  const durationMinutes = Math.min(minutes, 480); // Cap at 8 hours
  const endsAt = Date.now() + durationMinutes * 60 * 1000;
  currentTimer = {
    active: true,
    durationMinutes,
    endsAt,
  };

  activeTimeout = setTimeout(() => {
    currentTimer = null;
    activeTimeout = null;
    if (onExpire) {
      try {
        onExpire();
      } catch {}
    }
  }, durationMinutes * 60 * 1000);

  const unit = durationMinutes === 1 ? 'minute' : 'minutes';
  return {
    ok: true,
    speech: `Sleep timer set for ${durationMinutes} ${unit}, sir. Playback will stop automatically.`,
    timer: currentTimer,
  };
}

export function getSleepTimer(): { active: boolean; remainingMinutes: number; speech: string } {
  if (!currentTimer || !currentTimer.active) {
    return {
      active: false,
      remainingMinutes: 0,
      speech: 'There is no sleep timer active right now, sir.',
    };
  }

  const remainingMs = Math.max(0, currentTimer.endsAt - Date.now());
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  const unit = remainingMinutes === 1 ? 'minute' : 'minutes';
  return {
    active: true,
    remainingMinutes,
    speech: `Sleep timer has approximately ${remainingMinutes} ${unit} remaining, sir.`,
  };
}

export function cancelSleepTimer(): { ok: boolean; speech: string } {
  if (!currentTimer && !activeTimeout) {
    return {
      ok: true,
      speech: 'No sleep timer was active, sir.',
    };
  }

  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  currentTimer = null;

  return {
    ok: true,
    speech: 'Sleep timer cancelled, sir.',
  };
}

/**
 * Parses requests like "set a sleep timer for 30 minutes", "stop playing in 15 minutes",
 * "how much time left on sleep timer", "cancel sleep timer".
 */
export function parseSleepTimerRequest(
  lower: string
): { action: 'set' | 'get' | 'cancel'; minutes?: number } | null {
  const said = bareRequest(lower).toLowerCase();

  // Cancel
  if (/^(?:cancel|stop|clear|turn off) (?:the )?sleep timer$/.test(said)) {
    return { action: 'cancel' };
  }

  // Query
  if (
    /^(?:what is the |check (?:the )?|how much time (?:is )?left on (?:the )?)?sleep timer(?: status)?$/.test(said)
    || /^how long until (?:the )?sleep timer(?: ends)?$/.test(said)
  ) {
    return { action: 'get' };
  }

  // Set
  const setMatch = /^(?:set (?:a |the )?)?sleep timer (?:for |in )?(\d+) (?:minutes?|mins?)$/.exec(said)
    || /^(?:stop|pause)(?: playing| music| audio)? in (\d+) (?:minutes?|mins?)$/.exec(said);
  if (setMatch) {
    const mins = parseInt(setMatch[1], 10);
    if (Number.isFinite(mins) && mins > 0) {
      return { action: 'set', minutes: mins };
    }
  }

  return null;
}
