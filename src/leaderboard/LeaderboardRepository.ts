import {
  leaderboardQuerySchema,
  MAX_LEADERBOARD_ENTRIES,
  type LeaderboardEntry,
  type LeaderboardQuery,
} from './schemas';

export interface LeaderboardRepository {
  readonly storageLocation?: 'browser' | 'server';
  getTopEntries(query: LeaderboardQuery): Promise<LeaderboardEntry[]>;
  saveEntry(entry: LeaderboardEntry): Promise<void>;
  clearLocalEntries?(): Promise<void>;
}

export function compareLeaderboardEntries(
  left: LeaderboardEntry,
  right: LeaderboardEntry,
): number {
  return (
    right.score - left.score ||
    right.accuracy - left.accuracy ||
    left.elapsedMs - right.elapsedMs
  );
}

export function isInLeaderboardPartition(
  entry: LeaderboardEntry,
  query: LeaderboardQuery,
): boolean {
  return (
    entry.topicId === query.topicId &&
    entry.difficulty === query.difficulty &&
    entry.dataVersion === query.dataVersion &&
    entry.typingLanguage === query.typingLanguage &&
    entry.answerPolicy === query.answerPolicy &&
    entry.languageDataVersion === query.languageDataVersion &&
    (query.answerLocale === undefined || entry.answerLocale === query.answerLocale)
  );
}

export function selectTopLeaderboardEntries(
  entries: readonly LeaderboardEntry[],
  query: LeaderboardQuery,
): LeaderboardEntry[] {
  const validQuery = leaderboardQuerySchema.parse(query);

  return entries
    .filter((entry) => isInLeaderboardPartition(entry, validQuery))
    .sort(compareLeaderboardEntries)
    .slice(0, MAX_LEADERBOARD_ENTRIES);
}
