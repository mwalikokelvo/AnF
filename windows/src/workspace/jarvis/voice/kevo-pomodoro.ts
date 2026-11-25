/**
 * Kevo Pomodoro Timer: focus timer with 25/5 default cycles.
 * Uses setTimeout; speech notifications via callback.
 */

export interface PomodoroState {
  active: boolean;
  mode: 'work' | 'break';
  remainingMs: number;
  cyclesCompleted: number;
  startedAt?: number;
}

let state: PomodoroState = {
  active: false,
  mode: 'work',
  remainingMs: 0,
  cyclesCompleted: 0,
};

let timerId: ReturnType<typeof setTimeout> | null = null;
let onTick: ((s: PomodoroState) => void) | null = null;
let onComplete: ((msg: string) => void) | null = null;

export function setPomodoroCallbacks(
  tick: (s: PomodoroState) => void,
  complete: (msg: string) => void
): void {
  onTick = tick;
  onComplete = complete;
}

export function startPomodoro(workMin = 25, breakMin = 5): string {
  if (state.active) return 'A Pomodoro is already running, sir.';
  state = {
    active: true,
    mode: 'work',
    remainingMs: workMin * 60 * 1000,
    cyclesCompleted: 0,
    startedAt: Date.now(),
  };
  scheduleTick(workMin, breakMin);
  return `Pomodoro started. ${workMin} minutes of focus.`;
}

export function stopPomodoro(): string {
  if (!state.active) return 'No Pomodoro is running, sir.';
  if (timerId) clearTimeout(timerId);
  timerId = null;
  state.active = false;
  return 'Pomodoro stopped.';
}

export function getPomodoroStatus(): string {
  if (!state.active) return 'No Pomodoro is running.';
  const min = Math.ceil(state.remainingMs / 60000);
  return `${state.mode === 'work' ? 'Focus' : 'Break'} mode: about ${min} minute${min === 1 ? '' : 's'} remaining. Cycles completed: ${state.cyclesCompleted}.`;
}

function scheduleTick(workMin: number, breakMin: number): void {
  if (timerId) clearTimeout(timerId);
  const tickMs = 1000;
  timerId = setTimeout(() => {
    if (!state.active) return;
    state.remainingMs -= tickMs;
    if (onTick) onTick({ ...state });
    if (state.remainingMs <= 0) {
      if (state.mode === 'work') {
        state.mode = 'break';
        state.remainingMs = breakMin * 60 * 1000;
        state.cyclesCompleted += 1;
        if (onComplete) onComplete(`Focus complete. Take a ${breakMin}-minute break.`);
      } else {
        state.mode = 'work';
        state.remainingMs = workMin * 60 * 1000;
        if (onComplete) onComplete('Break over. Back to focus.');
      }
    }
    if (state.active) scheduleTick(workMin, breakMin);
  }, tickMs);
}
