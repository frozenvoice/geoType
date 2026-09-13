export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  readonly durationMs: number;
  readonly status: TimerStatus;
  readonly startedAtMs: number | null;
  readonly pausedAtMs: number | null;
  readonly accumulatedPausedMs: number;
  readonly endedAtMs: number | null;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function createTimer(durationMs: number): TimerState {
  return {
    durationMs: finiteNonNegative(durationMs),
    status: 'idle',
    startedAtMs: null,
    pausedAtMs: null,
    accumulatedPausedMs: 0,
    endedAtMs: null,
  };
}

export function startTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'idle') {
    return state;
  }

  return {
    ...state,
    status: 'running',
    startedAtMs: nowMs,
  };
}

export function pauseTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status !== 'running' || state.startedAtMs === null) {
    return state;
  }

  return {
    ...state,
    status: 'paused',
    pausedAtMs: Math.max(nowMs, state.startedAtMs),
  };
}

export function resumeTimer(state: TimerState, nowMs: number): TimerState {
  if (
    state.status !== 'paused' ||
    state.startedAtMs === null ||
    state.pausedAtMs === null
  ) {
    return state;
  }

  const resumedAtMs = Math.max(nowMs, state.pausedAtMs);
  return {
    ...state,
    status: 'running',
    pausedAtMs: null,
    accumulatedPausedMs:
      state.accumulatedPausedMs + (resumedAtMs - state.pausedAtMs),
  };
}

export function finishTimer(state: TimerState, nowMs: number): TimerState {
  if (state.status === 'idle' || state.status === 'finished') {
    return state;
  }

  const effectiveEnd =
    state.status === 'paused' && state.pausedAtMs !== null
      ? state.pausedAtMs
      : nowMs;

  return {
    ...state,
    status: 'finished',
    pausedAtMs: null,
    endedAtMs:
      state.startedAtMs === null
        ? effectiveEnd
        : Math.max(effectiveEnd, state.startedAtMs),
  };
}

export interface RemainingTimeInput {
  readonly durationMs: number;
  readonly startedAtMs: number;
  readonly nowMs: number;
  readonly pausedDurationMs?: number;
}

export function calculateRemainingMs({
  durationMs,
  startedAtMs,
  nowMs,
  pausedDurationMs = 0,
}: RemainingTimeInput): number {
  const elapsedMs = Math.max(
    0,
    nowMs - startedAtMs - finiteNonNegative(pausedDurationMs),
  );
  return Math.max(0, finiteNonNegative(durationMs) - elapsedMs);
}

export function getElapsedMs(state: TimerState, nowMs: number): number {
  if (state.startedAtMs === null) {
    return 0;
  }

  const effectiveNow =
    state.status === 'paused' && state.pausedAtMs !== null
      ? state.pausedAtMs
      : state.status === 'finished' && state.endedAtMs !== null
        ? state.endedAtMs
        : nowMs;

  return Math.min(
    state.durationMs,
    Math.max(
      0,
      effectiveNow - state.startedAtMs - state.accumulatedPausedMs,
    ),
  );
}

export function getRemainingMs(state: TimerState, nowMs: number): number {
  return Math.max(0, state.durationMs - getElapsedMs(state, nowMs));
}

export function isTimerExpired(state: TimerState, nowMs: number): boolean {
  return state.status !== 'idle' && getRemainingMs(state, nowMs) <= 0;
}

export function getTimerProgress(state: TimerState, nowMs: number): number {
  if (state.durationMs === 0) {
    return state.status === 'idle' ? 0 : 1;
  }

  return getElapsedMs(state, nowMs) / state.durationMs;
}
