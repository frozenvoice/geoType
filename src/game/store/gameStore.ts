import { create } from 'zustand';
import type { GeoFeature } from '../../geodata/types';
import type { GameSession } from '../session';
import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTIES,
  type DifficultyId,
} from '../config/difficulties';
import { calculateCorrectScore } from '../engine/scoring';
import { loadBrowserSettings, saveBrowserSettings } from './settings';

export type GamePhase =
  | 'menu'
  | 'loading'
  | 'flying'
  | 'ready'
  | 'playing'
  | 'resolving-correct'
  | 'resolving-miss'
  | 'paused'
  | 'finished';

export type QuestionResult = {
  featureId: string;
  result: 'correct' | 'miss';
  remainingMs: number;
  responseMs: number;
  hintCount: number;
  missReason: 'wrong' | 'timeout' | null;
};

export type VisitedFeature = {
  feature: GeoFeature;
  result: 'correct' | 'miss';
};

export type StartOptions = {
  timeScale?: number;
  deterministic?: boolean;
};

export type GameState = {
  phase: GamePhase;
  phaseBeforePause: GamePhase | null;
  /** Monotonic run token used to reject stale map/input callbacks. */
  runId: number;
  difficulty: DifficultyId;
  activeSession: GameSession | null;
  features: GeoFeature[];
  currentIndex: number;
  visited: VisitedFeature[];
  questionResults: QuestionResult[];
  remainingMs: number;
  deadlineMs: number;
  questionDurationMs: number;
  questionStartedAt: number;
  startedAt: number;
  finishedAt: number;
  pausedAt: number | null;
  totalPausedMs: number;
  score: number;
  streak: number;
  maxStreak: number;
  correctCount: number;
  missCount: number;
  currentHints: number;
  totalHints: number;
  questionResolved: boolean;
  lastMissReason: 'wrong' | 'timeout' | null;
  muted: boolean;
  reducedMotion: boolean;
  resumeNotice: boolean;
  timeScale: number;
  setDifficulty: (difficulty: DifficultyId) => void;
  toggleMuted: () => void;
  toggleReducedMotion: () => void;
  startGame: (session: GameSession, features: GeoFeature[], options?: StartOptions) => void;
  cameraArrived: () => void;
  startQuestion: (now?: number) => void;
  tick: (now: number) => number;
  useHint: () => void;
  resolveQuestion: (result: 'correct' | 'miss' | 'timeout', now?: number) => boolean;
  advanceQuestion: (now?: number) => void;
  pause: (fromVisibility?: boolean, now?: number) => void;
  resume: (now?: number) => void;
  replay: () => void;
  retrySameOrder: () => void;
  backToMenu: () => void;
};

function shuffle<T>(values: readonly T[], deterministic: boolean) {
  const result = [...values];
  if (deterministic) return result;
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex] as T, result[index] as T];
  }
  return result;
}

function difficultyTimeMs(difficulty: DifficultyId, timeScale: number) {
  return Math.max(500, DIFFICULTIES[difficulty].timeLimitMs * timeScale);
}

const initialSettings = loadBrowserSettings();

export const useGameStore = create<GameState>((set, get) => ({
  phase: 'menu',
  phaseBeforePause: null,
  runId: 0,
  difficulty: DEFAULT_DIFFICULTY_ID,
  activeSession: null,
  features: [],
  currentIndex: 0,
  visited: [],
  questionResults: [],
  remainingMs: 0,
  deadlineMs: 0,
  questionDurationMs: 0,
  questionStartedAt: 0,
  startedAt: 0,
  finishedAt: 0,
  pausedAt: null,
  totalPausedMs: 0,
  score: 0,
  streak: 0,
  maxStreak: 0,
  correctCount: 0,
  missCount: 0,
  currentHints: 0,
  totalHints: 0,
  questionResolved: false,
  lastMissReason: null,
  muted: initialSettings.muted,
  reducedMotion: initialSettings.reducedMotion,
  resumeNotice: false,
  timeScale: 1,

  setDifficulty: (difficulty) => {
    const phase = get().phase;
    if (phase !== 'menu' && phase !== 'finished') return;
    set({ difficulty });
  },
  toggleMuted: () => {
    const muted = !get().muted;
    saveBrowserSettings({ muted, reducedMotion: get().reducedMotion });
    set({ muted });
  },
  toggleReducedMotion: () => {
    const reducedMotion = !get().reducedMotion;
    saveBrowserSettings({ muted: get().muted, reducedMotion });
    set({ reducedMotion });
  },
  startGame: (session, features, options = {}) => {
    const state = get();
    const now = performance.now();
    const timeScale = options.timeScale ?? 1;
    const ordered = shuffle(features, options.deterministic === true);
    const duration = difficultyTimeMs(state.difficulty, timeScale);
    set({
      phase: ordered.length > 0 ? 'flying' : 'menu',
      phaseBeforePause: null,
      runId: state.runId + 1,
      activeSession: session,
      features: ordered,
      currentIndex: 0,
      visited: [],
      questionResults: [],
      remainingMs: duration,
      deadlineMs: 0,
      questionDurationMs: duration,
      questionStartedAt: 0,
      startedAt: now,
      finishedAt: 0,
      pausedAt: null,
      totalPausedMs: 0,
      score: 0,
      streak: 0,
      maxStreak: 0,
      correctCount: 0,
      missCount: 0,
      currentHints: 0,
      totalHints: 0,
      questionResolved: false,
      lastMissReason: null,
      resumeNotice: false,
      timeScale,
    });
  },
  cameraArrived: () => {
    const state = get();
    if (state.phase === 'flying') set({ phase: 'ready' });
    else if (state.phase === 'paused' && state.phaseBeforePause === 'flying') {
      set({ phaseBeforePause: 'ready' });
    }
  },
  startQuestion: (now = performance.now()) => {
    if (get().phase !== 'ready') return;
    // A hidden document cannot provide a reliable focus boundary. Keep the
    // question in ready until the visibility handler explicitly resumes it.
    if (typeof document !== 'undefined' && document.hidden) return;
    const duration = difficultyTimeMs(get().difficulty, get().timeScale);
    set({
      phase: 'playing',
      remainingMs: duration,
      questionDurationMs: duration,
      questionStartedAt: now,
      deadlineMs: now + duration,
      questionResolved: false,
      currentHints: 0,
      lastMissReason: null,
    });
  },
  tick: (now) => {
    const state = get();
    if (state.phase !== 'playing') return state.remainingMs;
    const remainingMs = Math.max(0, state.deadlineMs - now);
    set({ remainingMs });
    return remainingMs;
  },
  useHint: () => {
    if (get().phase !== 'playing') return;
    set((state) => ({ currentHints: state.currentHints + 1, totalHints: state.totalHints + 1 }));
  },
  resolveQuestion: (result, now = performance.now()) => {
    const state = get();
    if (state.phase !== 'playing' || state.questionResolved) return false;
    const feature = state.features[state.currentIndex];
    if (!feature) return false;
    const timedOut = result === 'timeout' || (state.deadlineMs > 0 && now >= state.deadlineMs);
    const correct = result === 'correct' && !timedOut;
    const remainingMs = Math.max(0, Math.min(state.remainingMs, state.deadlineMs - now));
    const responseMs = Math.max(0, state.questionDurationMs - remainingMs);
    const nextStreak = correct ? state.streak + 1 : 0;
    const gained = correct
      ? calculateCorrectScore({
          remainingMs,
          difficulty: state.difficulty,
          currentStreak: state.streak,
          hintCount: state.currentHints,
        })
      : 0;
    const missReason = correct ? null : timedOut ? 'timeout' : 'wrong';
    set({
      phase: correct ? 'resolving-correct' : 'resolving-miss',
      questionResolved: true,
      lastMissReason: missReason,
      score: state.score + gained,
      streak: nextStreak,
      maxStreak: Math.max(state.maxStreak, nextStreak),
      correctCount: state.correctCount + (correct ? 1 : 0),
      missCount: state.missCount + (correct ? 0 : 1),
      visited: [...state.visited, { feature, result: correct ? 'correct' : 'miss' }],
      questionResults: [
        ...state.questionResults,
        {
          featureId: feature.id,
          result: correct ? 'correct' : 'miss',
          remainingMs,
          responseMs,
          hintCount: state.currentHints,
          missReason,
        },
      ],
      remainingMs,
    });
    return true;
  },
  advanceQuestion: (now = performance.now()) => {
    const state = get();
    if (state.phase !== 'resolving-correct' && state.phase !== 'resolving-miss') return;
    if (state.currentIndex >= state.features.length - 1) {
      set({ phase: 'finished', finishedAt: now, questionResolved: true });
      return;
    }
    const duration = difficultyTimeMs(state.difficulty, state.timeScale);
    set({
      phase: 'flying',
      currentIndex: state.currentIndex + 1,
      remainingMs: duration,
      questionDurationMs: duration,
      deadlineMs: 0,
      questionStartedAt: 0,
      currentHints: 0,
      questionResolved: false,
      lastMissReason: null,
    });
  },
  pause: (fromVisibility = false, now = performance.now()) => {
    const state = get();
    if (!['playing', 'flying', 'ready', 'resolving-correct', 'resolving-miss'].includes(state.phase)) return;
    const remainingMs = state.phase === 'playing'
      ? Math.max(0, state.deadlineMs - now)
      : state.remainingMs;
    set({
      phase: 'paused',
      phaseBeforePause: state.phase,
      pausedAt: now,
      remainingMs,
      resumeNotice: fromVisibility || state.resumeNotice,
    });
  },
  resume: (now = performance.now()) => {
    const state = get();
    if (state.phase !== 'paused') return;
    const phase = state.phaseBeforePause ?? 'playing';
    const pausedDuration = state.pausedAt === null
      ? 0
      : Math.max(0, now - state.pausedAt);
    set({
      phase,
      phaseBeforePause: null,
      pausedAt: null,
      totalPausedMs: state.totalPausedMs + pausedDuration,
      deadlineMs: phase === 'playing' ? now + state.remainingMs : state.deadlineMs,
      resumeNotice: false,
    });
  },
  replay: () => {
    const state = get();
    if (state.activeSession) state.startGame(state.activeSession, state.features, { timeScale: state.timeScale });
  },
  retrySameOrder: () => {
    const state = get();
    if (state.activeSession) {
      state.startGame(state.activeSession, state.features, {
        timeScale: state.timeScale,
        deterministic: true,
      });
    }
  },
  backToMenu: () => set({
    phase: 'menu',
    activeSession: null,
    features: [],
    visited: [],
    questionResults: [],
    phaseBeforePause: null,
    pausedAt: null,
    totalPausedMs: 0,
  }),
}));

export function selectCurrentFeature(state: GameState) {
  return state.features[state.currentIndex] ?? null;
}
