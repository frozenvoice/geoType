import {
  DIFFICULTIES,
  type DifficultyConfig,
  type DifficultyId,
} from '../config/difficulties';

export const CORRECT_BASE_SCORE = 1_000;
export const STREAK_BONUS_PER_CORRECT = 50;
export const HINT_PENALTY = 150;

export interface CorrectScoreInput {
  readonly remainingMs: number;
  readonly difficulty: DifficultyId | DifficultyConfig;
  readonly currentStreak: number;
  readonly hintCount: number;
}

function toNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function calculateCorrectScore({
  remainingMs,
  difficulty,
  currentStreak,
  hintCount,
}: CorrectScoreInput): number {
  const config =
    typeof difficulty === 'string' ? DIFFICULTIES[difficulty] : difficulty;
  const timeBonus = Math.floor(toNonNegativeInteger(remainingMs) / 10);
  const streakBonus =
    toNonNegativeInteger(currentStreak) * STREAK_BONUS_PER_CORRECT;
  const hintPenalty = toNonNegativeInteger(hintCount) * HINT_PENALTY;
  const scoreBeforePenalty = Math.floor(
    (CORRECT_BASE_SCORE + timeBonus + streakBonus) * config.scoreMultiplier,
  );

  return Math.max(0, scoreBeforePenalty - hintPenalty);
}
