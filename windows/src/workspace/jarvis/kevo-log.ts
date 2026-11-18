/**
 * Kevo's log: one JSON line per event (microphone, phrases heard or ignored, requests, timers, Stop) in
 * `kevo/kevo-log.jsonl` in AnF's data folder, written by the `kevo_log_append` command. Nothing leaves the PC.
 */

/** Why a phrase that was heard did not become a request. */
export type KevoIgnoredReason = 'no_wake_word' | 'window_closed' | 'muted' | 'own_voice';

/** Where the log is kept (Tauri commands in the app); the desk only calls these. */
export interface KevoLogStore {
  append: (entry: Record<string, unknown>) => Promise<unknown>;
  /** Copies the log to Downloads and returns where it went. */
  save: () => Promise<string>;
  openFolder: () => Promise<unknown>;
}

/** Records one event without waiting for it: a log that cannot be written never gets in Kevo's way. */
export type KevoLog = (event: string, fields?: Record<string, unknown>) => void;

export function createKevoLog(append?: KevoLogStore['append']): KevoLog {
  return (event, fields) => {
    if (!append) return;
    try {
      void append({ t: new Date().toISOString(), event, ...fields }).catch(() => {});
    } catch { /* never breaks Kevo */ }
  };
}
