import {
  selectTopLeaderboardEntries,
  type LeaderboardRepository,
} from './LeaderboardRepository';
import {
  leaderboardEntrySchema,
  leaderboardQuerySchema,
  LEGACY_LANGUAGE_DATA_VERSION,
  LEGACY_LEADERBOARD_STORAGE_VERSION,
  LEADERBOARD_STORAGE_VERSION,
  legacyLeaderboardEntrySchema,
  type LeaderboardEntry,
  type LeaderboardQuery,
} from './schemas';

export const LOCAL_LEADERBOARD_STORAGE_KEY = `geotype:leaderboard:v${LEADERBOARD_STORAGE_VERSION}`;
export const LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY = `geotype:leaderboard:v${LEGACY_LEADERBOARD_STORAGE_VERSION}`;

export const LEGACY_LEADERBOARD_LANGUAGE_PARTITION = {
  typingLanguage: 'ko',
  answerPolicy: 'strict',
  languageDataVersion: LEGACY_LANGUAGE_DATA_VERSION,
} as const;

export interface LeaderboardStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LeaderboardStorageErrorOperation = 'read' | 'write' | 'clear';

export class LeaderboardStorageError extends Error {
  readonly operation: LeaderboardStorageErrorOperation;
  override readonly cause: unknown;

  constructor(operation: LeaderboardStorageErrorOperation, cause: unknown) {
    super(`로컬 랭킹을 ${operation === 'read' ? '불러오지' : operation === 'write' ? '저장하지' : '초기화하지'} 못했습니다.`);
    this.name = 'LeaderboardStorageError';
    this.operation = operation;
    this.cause = cause;
  }
}

function getDefaultStorage(): LeaderboardStorageAdapter {
  // Access can throw even before getItem() in privacy-restricted browsers.
  // Defer it until an operation so the game's module initialization succeeds
  // and the ranking screen can show its normal recoverable error state.
  return {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key),
  };
}

export class LocalStorageLeaderboardRepository implements LeaderboardRepository {
  readonly storageLocation = 'browser' as const;
  readonly #storage: LeaderboardStorageAdapter;

  constructor(storage: LeaderboardStorageAdapter = getDefaultStorage()) {
    this.#storage = storage;
  }

  // localStorage is synchronous; async keeps repository implementations interchangeable.
  // eslint-disable-next-line @typescript-eslint/require-await
  async getTopEntries(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const validQuery = leaderboardQuerySchema.parse(query);
    return selectTopLeaderboardEntries(this.#readEntries(), validQuery);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async saveEntry(entry: LeaderboardEntry): Promise<void> {
    const validEntry = leaderboardEntrySchema.parse(entry);
    const entries = this.#readEntries().filter(
      (storedEntry) => storedEntry.id !== validEntry.id,
    );

    entries.push(validEntry);
    this.#writeEntries(entries);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async clearLocalEntries(): Promise<void> {
    try {
      this.#storage.removeItem(LOCAL_LEADERBOARD_STORAGE_KEY);
      this.#storage.removeItem(LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY);
    } catch (error) {
      throw new LeaderboardStorageError('clear', error);
    }
  }

  #readEntries(): LeaderboardEntry[] {
    let raw: string | null;

    try {
      raw = this.#storage.getItem(LOCAL_LEADERBOARD_STORAGE_KEY);
    } catch (error) {
      throw new LeaderboardStorageError('read', error);
    }

    if (raw === null) {
      return this.#readLegacyEntries();
    }

    let decoded: unknown;

    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      this.#repairStorage([]);
      return [];
    }

    if (!this.#isCurrentEnvelope(decoded)) {
      this.#repairStorage([]);
      return [];
    }

    const entries: LeaderboardEntry[] = [];
    let needsRepair = false;

    for (const candidate of decoded.entries) {
      const parsedEntry = leaderboardEntrySchema.safeParse(candidate);
      if (parsedEntry.success) {
        entries.push(parsedEntry.data);
      } else {
        needsRepair = true;
      }
    }

    if (needsRepair) {
      this.#repairStorage(entries);
    }

    return entries;
  }

  #isCurrentEnvelope(
    value: unknown,
  ): value is { version: typeof LEADERBOARD_STORAGE_VERSION; entries: unknown[] } {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const envelope = value as Record<string, unknown>;
    return (
      envelope.version === LEADERBOARD_STORAGE_VERSION &&
      Array.isArray(envelope.entries)
    );
  }

  #readLegacyEntries(): LeaderboardEntry[] {
    let raw: string | null;

    try {
      raw = this.#storage.getItem(LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY);
    } catch (error) {
      throw new LeaderboardStorageError('read', error);
    }

    if (raw === null) return [];

    const entries: LeaderboardEntry[] = [];
    let decoded: unknown;

    try {
      decoded = JSON.parse(raw) as unknown;
    } catch {
      decoded = null;
    }

    if (this.#isLegacyEnvelope(decoded)) {
      for (const candidate of decoded.entries) {
        const parsedEntry = legacyLeaderboardEntrySchema.safeParse(candidate);
        if (!parsedEntry.success) continue;
        entries.push({
          ...parsedEntry.data,
          ...LEGACY_LEADERBOARD_LANGUAGE_PARTITION,
        });
      }
    }

    // Persist first, then retire v1. If storage is blocked, the in-memory
    // migration remains usable and the original record is left untouched.
    if (this.#repairStorage(entries)) {
      try {
        this.#storage.removeItem(LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY);
      } catch {
        // A leftover v1 key is harmless because the v2 envelope now wins.
      }
    }

    return entries;
  }

  #isLegacyEnvelope(
    value: unknown,
  ): value is { version: typeof LEGACY_LEADERBOARD_STORAGE_VERSION; entries: unknown[] } {
    if (typeof value !== 'object' || value === null) return false;
    const envelope = value as Record<string, unknown>;
    return (
      envelope.version === LEGACY_LEADERBOARD_STORAGE_VERSION
      && Array.isArray(envelope.entries)
    );
  }

  #repairStorage(entries: readonly LeaderboardEntry[]): boolean {
    try {
      this.#writeEntries(entries);
      return true;
    } catch {
      // Reads remain recoverable even when privacy settings prevent the repair write.
      return false;
    }
  }

  #writeEntries(entries: readonly LeaderboardEntry[]): void {
    try {
      this.#storage.setItem(
        LOCAL_LEADERBOARD_STORAGE_KEY,
        JSON.stringify({
          version: LEADERBOARD_STORAGE_VERSION,
          entries,
        }),
      );
    } catch (error) {
      throw new LeaderboardStorageError('write', error);
    }
  }
}
