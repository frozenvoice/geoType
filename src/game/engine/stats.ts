import type { DifficultyConfig, DifficultyId } from '../config/difficulties';
import { calculateCorrectScore } from './scoring';

export type RoundOutcome = 'correct' | 'miss' | 'timeout';

export interface RoundResultInput {
  readonly questionId: string;
  readonly outcome: RoundOutcome;
  readonly remainingMs: number;
  readonly responseMs: number;
  readonly hintCount: number;
}

export interface RecordedRound extends RoundResultInput {
  readonly awardedScore: number;
  readonly streakAfter: number;
}

export interface GameStats {
  readonly score: number;
  readonly correctCount: number;
  readonly missCount: number;
  readonly totalHints: number;
  readonly currentStreak: number;
  readonly maxStreak: number;
  readonly totalResponseMs: number;
  readonly rounds: readonly RecordedRound[];
}

export interface GameSummary extends GameStats {
  readonly accuracy: number;
  readonly averageResponseMs: number;
  readonly elapsedMs: number;
}

export function createInitialStats(): GameStats {
  return {
    score: 0,
    correctCount: 0,
    missCount: 0,
    totalHints: 0,
    currentStreak: 0,
    maxStreak: 0,
    totalResponseMs: 0,
    rounds: [],
  };
}

export function recordRound(
  state: GameStats,
  result: RoundResultInput,
  difficulty: DifficultyId | DifficultyConfig,
): GameStats {
  if (state.rounds.some((round) => round.questionId === result.questionId)) {
    return state;
  }

  const isCorrect = result.outcome === 'correct';
  const awardedScore = isCorrect
    ? calculateCorrectScore({
        remainingMs: result.remainingMs,
        difficulty,
        currentStreak: state.currentStreak,
        hintCount: result.hintCount,
      })
    : 0;
  const nextStreak = isCorrect ? state.currentStreak + 1 : 0;
  const recordedRound: RecordedRound = {
    ...result,
    remainingMs: Math.max(0, result.remainingMs),
    responseMs: Math.max(0, result.responseMs),
    hintCount: Math.max(0, Math.floor(result.hintCount)),
    awardedScore,
    streakAfter: nextStreak,
  };

  return {
    score: state.score + awardedScore,
    correctCount: state.correctCount + (isCorrect ? 1 : 0),
    missCount: state.missCount + (isCorrect ? 0 : 1),
    totalHints: state.totalHints + recordedRound.hintCount,
    currentStreak: nextStreak,
    maxStreak: Math.max(state.maxStreak, nextStreak),
    totalResponseMs: state.totalResponseMs + recordedRound.responseMs,
    rounds: [...state.rounds, recordedRound],
  };
}

export function getAccuracy(state: GameStats): number {
  const attempts = state.correctCount + state.missCount;
  return attempts === 0 ? 0 : state.correctCount / attempts;
}

export function getAverageResponseMs(state: GameStats): number {
  return state.rounds.length === 0
    ? 0
    : state.totalResponseMs / state.rounds.length;
}

export function buildGameSummary(
  state: GameStats,
  elapsedMs: number,
): GameSummary {
  return {
    ...state,
    accuracy: getAccuracy(state),
    averageResponseMs: getAverageResponseMs(state),
    elapsedMs: Math.max(0, elapsedMs),
  };
}
