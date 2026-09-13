export type DifficultyId = 'easy' | 'normal' | 'hard' | 'expert';

export interface DifficultyConfig {
  readonly id: DifficultyId;
  readonly labelKo: string;
  readonly timeLimitMs: number;
  readonly firstHintDelayMs: number | null;
  readonly subsequentHintDelayMs: number | null;
  readonly scoreMultiplier: number;
  /** Compatibility name used by the UI timer scheduler. */
  readonly firstHintMs: number | null;
  /** Compatibility name used by the UI timer scheduler. */
  readonly hintIntervalMs: number | null;
  /** Compatibility name used by score displays and the store. */
  readonly multiplier: number;
}

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    labelKo: '쉬움',
    timeLimitMs: 45_000,
    firstHintDelayMs: 4_000,
    subsequentHintDelayMs: 3_000,
    scoreMultiplier: 1,
    firstHintMs: 4_000,
    hintIntervalMs: 3_000,
    multiplier: 1,
  },
  normal: {
    id: 'normal',
    labelKo: '보통',
    timeLimitMs: 30_000,
    firstHintDelayMs: 7_000,
    subsequentHintDelayMs: 5_000,
    scoreMultiplier: 1.5,
    firstHintMs: 7_000,
    hintIntervalMs: 5_000,
    multiplier: 1.5,
  },
  hard: {
    id: 'hard',
    labelKo: '어려움',
    timeLimitMs: 20_000,
    firstHintDelayMs: 10_000,
    subsequentHintDelayMs: 7_000,
    scoreMultiplier: 2,
    firstHintMs: 10_000,
    hintIntervalMs: 7_000,
    multiplier: 2,
  },
  expert: {
    id: 'expert',
    labelKo: '전문가',
    timeLimitMs: 12_000,
    firstHintDelayMs: null,
    subsequentHintDelayMs: null,
    scoreMultiplier: 3,
    firstHintMs: null,
    hintIntervalMs: null,
    multiplier: 3,
  },
} as const satisfies Record<DifficultyId, DifficultyConfig>;

export const DIFFICULTY_ORDER = [
  'easy',
  'normal',
  'hard',
  'expert',
] as const satisfies readonly DifficultyId[];

export const DEFAULT_DIFFICULTY_ID: DifficultyId = 'normal';

export function getDifficultyConfig(id: DifficultyId): DifficultyConfig {
  return DIFFICULTIES[id];
}

export function getDifficultyTimeLimitSeconds(id: DifficultyId): number {
  return DIFFICULTIES[id].timeLimitMs / 1_000;
}

export function getDifficultyMenuLabel(id: DifficultyId): string {
  return `${DIFFICULTIES[id].labelKo} · ${getDifficultyTimeLimitSeconds(id)}초`;
}
