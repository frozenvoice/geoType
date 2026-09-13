import { z } from 'zod';

export const LEADERBOARD_STORAGE_VERSION = 2 as const;
export const LEGACY_LEADERBOARD_STORAGE_VERSION = 1 as const;
export const MAX_LEADERBOARD_ENTRIES = 20;
export const CURRENT_LANGUAGE_DATA_VERSION = 'place-names-v1';
export const LEGACY_LANGUAGE_DATA_VERSION = 'legacy-v1';

export const difficultyIdSchema = z.enum(['easy', 'normal', 'hard', 'expert']);
export const typingLanguageSchema = z.enum([
  'ko',
  'en',
  'native',
  'romanized',
  'ja-kanji',
  'ja-reading',
]);
export const answerPolicySchema = z.enum(['strict', 'casual']);

const leaderboardEntryV1Fields = {
  id: z.string().trim().min(1),
  nickname: z.string().trim().min(1).max(12),
  topicId: z.string().trim().min(1),
  topicTitle: z.string().trim().min(1),
  difficulty: difficultyIdSchema,
  dataVersion: z.string().trim().min(1),
  score: z.number().finite().int().nonnegative(),
  correctCount: z.number().finite().int().nonnegative(),
  missCount: z.number().finite().int().nonnegative(),
  accuracy: z.number().finite().min(0).max(100),
  totalHints: z.number().finite().int().nonnegative(),
  maxStreak: z.number().finite().int().nonnegative(),
  elapsedMs: z.number().finite().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
} as const;

export const legacyLeaderboardEntrySchema = z
  .object(leaderboardEntryV1Fields)
  .strict();

export const leaderboardEntrySchema = z
  .object({
    ...leaderboardEntryV1Fields,
    typingLanguage: typingLanguageSchema,
    answerPolicy: answerPolicySchema,
    answerLocale: z.string().trim().min(1).optional(),
    languageDataVersion: z.string().trim().min(1),
  })
  .strict();

export const leaderboardQuerySchema = z
  .object({
    topicId: z.string().trim().min(1),
    difficulty: difficultyIdSchema,
    dataVersion: z.string().trim().min(1),
    typingLanguage: typingLanguageSchema,
    answerPolicy: answerPolicySchema,
    answerLocale: z.string().trim().min(1).optional(),
    languageDataVersion: z.string().trim().min(1),
  })
  .strict();

export const leaderboardStorageSchema = z
  .object({
    version: z.literal(LEADERBOARD_STORAGE_VERSION),
    entries: z.array(leaderboardEntrySchema),
  })
  .strict();

export const httpLeaderboardListResponseSchema = z
  .object({
    entries: z.array(leaderboardEntrySchema),
  })
  .strict();

export type DifficultyId = z.infer<typeof difficultyIdSchema>;
export type TypingLanguage = z.infer<typeof typingLanguageSchema>;
export type AnswerPolicy = z.infer<typeof answerPolicySchema>;
export type LegacyLeaderboardEntry = z.infer<typeof legacyLeaderboardEntrySchema>;
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
export type LeaderboardStorage = z.infer<typeof leaderboardStorageSchema>;
export type HttpLeaderboardListResponse = z.infer<
  typeof httpLeaderboardListResponseSchema
>;
