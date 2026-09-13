import { describe, expect, it } from 'vitest';

import { DIFFICULTIES } from '../game/config/difficulties';
import { calculateCorrectScore } from '../game/engine/scoring';
import {
  buildGameSummary,
  createInitialStats,
  recordRound,
} from '../game/engine/stats';
import {
  calculateRemainingMs,
  createTimer,
  finishTimer,
  getElapsedMs,
  getRemainingMs,
  getTimerProgress,
  isTimerExpired,
  pauseTimer,
  resumeTimer,
  startTimer,
} from '../game/engine/timer';

describe('monotonic timer math', () => {
  it('derives remaining time from timestamps instead of interval ticks', () => {
    expect(
      calculateRemainingMs({
        durationMs: 10_000,
        startedAtMs: 1_000,
        nowMs: 4_250,
      }),
    ).toBe(6_750);
    expect(
      calculateRemainingMs({
        durationMs: 10_000,
        startedAtMs: 1_000,
        nowMs: 20_000,
      }),
    ).toBe(0);
  });

  it('excludes hidden-tab pause time and freezes after finish', () => {
    let timer = startTimer(createTimer(10_000), 1_000);
    timer = pauseTimer(timer, 4_000);
    expect(getRemainingMs(timer, 9_000)).toBe(7_000);

    timer = resumeTimer(timer, 9_000);
    expect(getElapsedMs(timer, 11_000)).toBe(5_000);
    expect(getTimerProgress(timer, 11_000)).toBe(0.5);
    expect(isTimerExpired(timer, 16_000)).toBe(true);

    timer = finishTimer(timer, 12_000);
    expect(getRemainingMs(timer, 50_000)).toBe(4_000);
  });
});

describe('scoring and aggregate stats', () => {
  it('applies time, streak, difficulty, and hint rules in the specified order', () => {
    expect(
      calculateCorrectScore({
        remainingMs: 5_000,
        difficulty: 'normal',
        currentStreak: 2,
        hintCount: 1,
      }),
    ).toBe(2_250);
    expect(
      calculateCorrectScore({
        remainingMs: -1,
        difficulty: DIFFICULTIES.easy,
        currentStreak: 0,
        hintCount: 99,
      }),
    ).toBe(0);
  });

  it('increments streak on correct, resets on miss, and guards duplicate rounds', () => {
    let stats = createInitialStats();
    stats = recordRound(
      stats,
      {
        questionId: 'seoul',
        outcome: 'correct',
        remainingMs: 5_000,
        responseMs: 5_000,
        hintCount: 1,
      },
      'normal',
    );
    expect(stats.currentStreak).toBe(1);
    expect(stats.maxStreak).toBe(1);
    expect(stats.correctCount).toBe(1);

    const duplicate = recordRound(
      stats,
      {
        questionId: 'seoul',
        outcome: 'correct',
        remainingMs: 10_000,
        responseMs: 0,
        hintCount: 0,
      },
      'normal',
    );
    expect(duplicate).toBe(stats);

    stats = recordRound(
      stats,
      {
        questionId: 'busan',
        outcome: 'timeout',
        remainingMs: 0,
        responseMs: 10_000,
        hintCount: 2,
      },
      'normal',
    );
    expect(stats.currentStreak).toBe(0);
    expect(stats.missCount).toBe(1);
    expect(stats.totalHints).toBe(3);

    const summary = buildGameSummary(stats, 20_000);
    expect(summary.accuracy).toBe(0.5);
    expect(summary.averageResponseMs).toBe(7_500);
    expect(summary.elapsedMs).toBe(20_000);
  });
});
