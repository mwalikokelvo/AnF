/**
 * Pomodoro & Focus Timer Engine
 *
 * Implements a distraction-free Pomodoro session state machine with:
 * - 25m Focus, 5m Short Break, and 15m Long Break intervals
 * - Pure Web Audio harmonic chime synthesis (zero external audio files needed)
 * - Markdown session logging for AnF daily notes and task trackers
 *
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, native Web Audio, 0 deps.
 */

export type PomodoroMode = 'focus' | 'short-break' | 'long-break';
export type PomodoroState = 'idle' | 'running' | 'paused' | 'completed';

export interface PomodoroConfig {
  focusMinutes: number; // default 25
  shortBreakMinutes: number; // default 5
  longBreakMinutes: number; // default 15
  longBreakInterval: number; // sessions before long break, default 4
  autoStartBreaks: boolean;
}

export interface CompletedSession {
  id: string;
  mode: PomodoroMode;
  durationMinutes: number;
  completedAt: string;
  taskLabel?: string;
}

export interface PomodoroStatus {
  state: PomodoroState;
  mode: PomodoroMode;
  remaining: number;
  total: number;
  progress: number;
  completedFocusCount: number;
  label: string;
}

export type PomodoroListener = (status: PomodoroStatus) => void;

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakInterval: 4,
  autoStartBreaks: false,
};

export class PomodoroSession {
  private config: PomodoroConfig;
  private state: PomodoroState = 'idle';
  private mode: PomodoroMode = 'focus';
  private remainingSeconds: number;
  private totalSeconds: number;
  private completedFocusCount = 0;
  private activeLabel = 'Deep Work';
  private timerId: ReturnType<typeof setInterval> | undefined;
  private listeners: Set<PomodoroListener> = new Set();

  constructor(config: Partial<PomodoroConfig> = {}) {
    this.config = { ...DEFAULT_POMODORO_CONFIG, ...config };
    this.remainingSeconds = this.config.focusMinutes * 60;
    this.totalSeconds = this.remainingSeconds;
  }

  public getStatus(): PomodoroStatus {
    const progress = this.totalSeconds > 0
      ? Math.min(1, Math.max(0, 1 - this.remainingSeconds / this.totalSeconds))
      : 0;

    return {
      state: this.state,
      mode: this.mode,
      remaining: this.remainingSeconds,
      total: this.totalSeconds,
      progress: Math.round(progress * 10000) / 10000,
      completedFocusCount: this.completedFocusCount,
      label: this.activeLabel,
    };
  }

  public subscribe(cb: PomodoroListener): () => void {
    this.listeners.add(cb);
    cb(this.getStatus());
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const status = this.getStatus();
    for (const l of this.listeners) {
      try { l(status); } catch { /* ignore subscriber error */ }
    }
  }

  public setMode(mode: PomodoroMode, label?: string): void {
    this.pause();
    this.mode = mode;
    if (label) this.activeLabel = label;

    let minutes = this.config.focusMinutes;
    if (mode === 'short-break') minutes = this.config.shortBreakMinutes;
    else if (mode === 'long-break') minutes = this.config.longBreakMinutes;

    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.state = 'idle';
    this.notify();
  }

  public start(): void {
    if (this.state === 'running') return;

    if (this.state === 'completed' || this.remainingSeconds <= 0) {
      this.reset();
    }

    this.state = 'running';
    if (this.timerId) clearInterval(this.timerId);

    this.timerId = setInterval(() => {
      this.tick();
    }, 1000);

    this.notify();
  }

  public pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = undefined;
    }
    this.notify();
  }

  public reset(): void {
    this.pause();
    this.state = 'idle';
    let minutes = this.config.focusMinutes;
    if (this.mode === 'short-break') minutes = this.config.shortBreakMinutes;
    else if (this.mode === 'long-break') minutes = this.config.longBreakMinutes;

    this.totalSeconds = minutes * 60;
    this.remainingSeconds = this.totalSeconds;
    this.notify();
  }

  public tick(): void {
    if (this.remainingSeconds > 0) {
      this.remainingSeconds--;
      this.notify();
    }

    if (this.remainingSeconds <= 0) {
      this.completeSession();
    }
  }

  private completeSession(): void {
    this.pause();
    this.state = 'completed';

    if (this.mode === 'focus') {
      this.completedFocusCount++;
      // Determine next break
      const isLong = this.completedFocusCount % this.config.longBreakInterval === 0;
      this.mode = isLong ? 'long-break' : 'short-break';
      const breakMins = isLong ? this.config.longBreakMinutes : this.config.shortBreakMinutes;
      this.totalSeconds = breakMins * 60;
      this.remainingSeconds = this.totalSeconds;
    } else {
      // Break completed, switch back to focus
      this.mode = 'focus';
      this.totalSeconds = this.config.focusMinutes * 60;
      this.remainingSeconds = this.totalSeconds;
    }

    this.notify();
  }

  public formatSessionMarkdown(label?: string): string {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sessionLabel = label || this.activeLabel;
    const duration = Math.round(this.totalSeconds / 60);

    return `- [x] **Focus Session**: ${sessionLabel} (${duration}m) — completed at ${timeStr}\n`;
  }
}

/**
 * Synthesizes a gentle harmonic bell chime using the Web Audio API.
 * Uses decaying sine harmonics (fundamental + 2nd + 3rd harmonic).
 */
export function playChime(audioContext?: AudioContext, type: 'start' | 'complete' = 'complete'): void {
  if (typeof window === 'undefined') return;
  const ctx = audioContext || new (window.AudioContext || (window as any).webkitAudioContext)();
  if (!ctx || ctx.state === 'suspended') {
    void ctx?.resume();
  }

  const now = ctx.currentTime;
  const fundamental = type === 'start' ? 528 : 880; // 528 Hz (solfeggio transformation) or 880 Hz (A5 clarity)
  const harmonics = [1, 2, 2.76];
  const gains = [0.3, 0.15, 0.05];

  for (let i = 0; i < harmonics.length; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(fundamental * harmonics[i], now);

    gain.gain.setValueAtTime(gains[i], now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.8);
  }
}
