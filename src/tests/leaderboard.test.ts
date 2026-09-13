import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HttpLeaderboardRepository,
  LEGACY_LEADERBOARD_LANGUAGE_PARTITION,
  LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY,
  LOCAL_LEADERBOARD_STORAGE_KEY,
  LocalStorageLeaderboardRepository,
  type LegacyLeaderboardEntry,
  type LeaderboardEntry,
  type LeaderboardQuery,
} from '../leaderboard';

const query: LeaderboardQuery = {
  topicId: 'seoul-districts',
  difficulty: 'normal',
  dataVersion: '2026.1',
  typingLanguage: 'ko',
  answerPolicy: 'strict',
  answerLocale: 'ko',
  languageDataVersion: 'place-names-v1',
};

function makeEntry(
  overrides: Partial<LeaderboardEntry> = {},
): LeaderboardEntry {
  return {
    id: 'entry-1',
    nickname: '지오',
    topicId: query.topicId,
    topicTitle: '서울특별시 · 선택한 행정구역 범위',
    difficulty: query.difficulty,
    dataVersion: query.dataVersion,
    typingLanguage: query.typingLanguage,
    answerPolicy: query.answerPolicy,
    answerLocale: query.answerLocale,
    languageDataVersion: query.languageDataVersion,
    score: 1_000,
    correctCount: 20,
    missCount: 5,
    accuracy: 80,
    totalHints: 3,
    maxStreak: 8,
    elapsedMs: 50_000,
    createdAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
}

function makeLegacyEntry(overrides: Partial<LegacyLeaderboardEntry> = {}): LegacyLeaderboardEntry {
  const current = makeEntry();
  return {
    id: current.id,
    nickname: current.nickname,
    topicId: current.topicId,
    topicTitle: current.topicTitle,
    difficulty: current.difficulty,
    dataVersion: current.dataVersion,
    score: current.score,
    correctCount: current.correctCount,
    missCount: current.missCount,
    accuracy: current.accuracy,
    totalHints: current.totalHints,
    maxStreak: current.maxStreak,
    elapsedMs: current.elapsedMs,
    createdAt: current.createdAt,
    ...overrides,
  };
}

describe('LocalStorageLeaderboardRepository', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps scope, difficulty, data, language, policy, and locale in separate partitions', async () => {
    const repository = new LocalStorageLeaderboardRepository();
    const current = makeEntry({ id: 'current' });
    const otherTopic = makeEntry({ id: 'other-topic', topicId: 'world-capitals' });
    const otherDifficulty = makeEntry({ id: 'other-difficulty', difficulty: 'hard' });
    const otherVersion = makeEntry({ id: 'other-version', dataVersion: '2027.1' });
    const otherLanguage = makeEntry({ id: 'other-language', typingLanguage: 'en', answerLocale: 'en' });
    const otherPolicy = makeEntry({ id: 'other-policy', answerPolicy: 'casual' });
    const otherLanguageVersion = makeEntry({ id: 'other-language-version', languageDataVersion: 'place-names-v2' });
    const otherAnswerLocale = makeEntry({ id: 'other-answer-locale', answerLocale: 'ko-KR' });

    await Promise.all(
      [
        current,
        otherTopic,
        otherDifficulty,
        otherVersion,
        otherLanguage,
        otherPolicy,
        otherLanguageVersion,
        otherAnswerLocale,
      ].map((entry) =>
        repository.saveEntry(entry),
      ),
    );

    await expect(repository.getTopEntries(query)).resolves.toEqual([current]);
  });

  it('sorts by score, accuracy, then shorter elapsed time', async () => {
    const repository = new LocalStorageLeaderboardRepository();
    const entries = [
      makeEntry({ id: 'lower-score', score: 999, accuracy: 100, elapsedMs: 1 }),
      makeEntry({ id: 'slower', score: 1_000, accuracy: 90, elapsedMs: 20_000 }),
      makeEntry({ id: 'faster', score: 1_000, accuracy: 90, elapsedMs: 10_000 }),
      makeEntry({ id: 'lower-accuracy', score: 1_000, accuracy: 80, elapsedMs: 1 }),
    ];

    for (const entry of entries) {
      await repository.saveEntry(entry);
    }

    const result = await repository.getTopEntries(query);
    expect(result.map(({ id }) => id)).toEqual([
      'faster',
      'slower',
      'lower-accuracy',
      'lower-score',
    ]);
  });

  it('returns at most the best 20 entries', async () => {
    const repository = new LocalStorageLeaderboardRepository();

    for (let index = 0; index < 25; index += 1) {
      await repository.saveEntry(
        makeEntry({ id: `entry-${index}`, score: index }),
      );
    }

    const result = await repository.getTopEntries(query);
    expect(result).toHaveLength(20);
    expect(result[0]?.score).toBe(24);
    expect(result.at(-1)?.score).toBe(5);
  });

  it('recovers malformed JSON and remains writable', async () => {
    localStorage.setItem(LOCAL_LEADERBOARD_STORAGE_KEY, '{broken json');
    const repository = new LocalStorageLeaderboardRepository();

    await expect(repository.getTopEntries(query)).resolves.toEqual([]);
    await repository.saveEntry(makeEntry());

    await expect(repository.getTopEntries(query)).resolves.toEqual([makeEntry()]);
  });

  it('salvages valid entries when individual stored records are corrupt', async () => {
    const validEntry = makeEntry({ id: 'valid' });
    localStorage.setItem(
      LOCAL_LEADERBOARD_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        entries: [validEntry, { ...makeEntry({ id: 'invalid' }), nickname: '' }],
      }),
    );

    const repository = new LocalStorageLeaderboardRepository();
    await expect(repository.getTopEntries(query)).resolves.toEqual([validEntry]);

    const repaired = JSON.parse(
      localStorage.getItem(LOCAL_LEADERBOARD_STORAGE_KEY) ?? 'null',
    ) as { entries: LeaderboardEntry[] };
    expect(repaired.entries).toEqual([validEntry]);
  });

  it('resets storage from an unsupported version', async () => {
    localStorage.setItem(
      LOCAL_LEADERBOARD_STORAGE_KEY,
      JSON.stringify({ version: 999, entries: [makeEntry()] }),
    );
    const repository = new LocalStorageLeaderboardRepository();

    await expect(repository.getTopEntries(query)).resolves.toEqual([]);
    expect(JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_STORAGE_KEY) ?? 'null')).toEqual({
      version: 2,
      entries: [],
    });
  });

  it('migrates v1 records into an explicit Korean strict legacy bucket', async () => {
    const legacyEntry = makeLegacyEntry({ id: 'legacy-entry' });
    localStorage.setItem(
      LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY,
      JSON.stringify({ version: 1, entries: [legacyEntry] }),
    );
    const repository = new LocalStorageLeaderboardRepository();
    const legacyQuery: LeaderboardQuery = {
      topicId: query.topicId,
      difficulty: query.difficulty,
      dataVersion: query.dataVersion,
      ...LEGACY_LEADERBOARD_LANGUAGE_PARTITION,
    };
    const migratedEntry: LeaderboardEntry = {
      ...legacyEntry,
      ...LEGACY_LEADERBOARD_LANGUAGE_PARTITION,
    };

    await expect(repository.getTopEntries(legacyQuery)).resolves.toEqual([migratedEntry]);
    await expect(repository.getTopEntries(query)).resolves.toEqual([]);
    expect(localStorage.getItem(LEGACY_LOCAL_LEADERBOARD_STORAGE_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem(LOCAL_LEADERBOARD_STORAGE_KEY) ?? 'null')).toEqual({
      version: 2,
      entries: [migratedEntry],
    });
  });

  it('updates a repeated id instead of duplicating it and can clear all entries', async () => {
    const repository = new LocalStorageLeaderboardRepository();
    await repository.saveEntry(makeEntry({ score: 100 }));
    await repository.saveEntry(makeEntry({ score: 200 }));

    const result = await repository.getTopEntries(query);
    expect(result).toHaveLength(1);
    expect(result[0]?.score).toBe(200);

    await repository.clearLocalEntries();
    await expect(repository.getTopEntries(query)).resolves.toEqual([]);
  });
});

describe('HttpLeaderboardRepository', () => {
  it('uses the documented GET query contract and validates the response', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ entries: [makeEntry()] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const repository = new HttpLeaderboardRepository('https://api.example.test/v1/', {
      fetch: fetchMock,
    });

    await expect(repository.getTopEntries(query)).resolves.toEqual([makeEntry()]);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/v1/leaderboard?topicId=seoul-districts&difficulty=normal&dataVersion=2026.1&typingLanguage=ko&answerPolicy=strict&languageDataVersion=place-names-v1&answerLocale=ko',
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: 'GET' });
  });

  it('posts a validated entry as JSON', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const repository = new HttpLeaderboardRepository('https://api.example.test', {
      fetch: fetchMock,
    });
    const entry = makeEntry();

    await repository.saveEntry(entry);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/leaderboard',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body;
    expect(typeof body).toBe('string');
    if (typeof body !== 'string') throw new Error('Expected a JSON request body.');
    expect(JSON.parse(body)).toEqual(entry);
  });

  it('reports HTTP, network, and invalid response failures explicitly', async () => {
    const httpRepository = new HttpLeaderboardRepository('https://api.example.test', {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, { status: 503 }),
      ),
    });
    await expect(httpRepository.getTopEntries(query)).rejects.toMatchObject({
      code: 'http',
      status: 503,
    });

    const networkRepository = new HttpLeaderboardRepository('https://api.example.test', {
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new Error('offline')),
    });
    await expect(networkRepository.getTopEntries(query)).rejects.toMatchObject({
      code: 'network',
    });

    const invalidRepository = new HttpLeaderboardRepository('https://api.example.test', {
      fetch: vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ entries: [{ nope: true }] }), { status: 200 }),
      ),
    });
    await expect(invalidRepository.getTopEntries(query)).rejects.toMatchObject({
      code: 'invalid-response',
    });
  });
});
