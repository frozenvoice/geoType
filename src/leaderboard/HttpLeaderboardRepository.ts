import {
  selectTopLeaderboardEntries,
  type LeaderboardRepository,
} from './LeaderboardRepository';
import {
  httpLeaderboardListResponseSchema,
  leaderboardEntrySchema,
  leaderboardQuerySchema,
  type LeaderboardEntry,
  type LeaderboardQuery,
} from './schemas';

export type LeaderboardHttpErrorCode =
  | 'configuration'
  | 'network'
  | 'http'
  | 'invalid-response';

export class LeaderboardHttpError extends Error {
  readonly code: LeaderboardHttpErrorCode;
  readonly status: number | undefined;
  override readonly cause: unknown;

  constructor(
    code: LeaderboardHttpErrorCode,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'LeaderboardHttpError';
    this.code = code;
    this.status = options.status;
    this.cause = options.cause;
  }
}

export interface HttpLeaderboardRepositoryOptions {
  fetch?: typeof fetch;
}

export class HttpLeaderboardRepository implements LeaderboardRepository {
  readonly storageLocation = 'server' as const;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(baseUrl: string, options: HttpLeaderboardRepositoryOptions = {}) {
    const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
    if (normalizedBaseUrl.length === 0) {
      throw new LeaderboardHttpError(
        'configuration',
        'HTTP 랭킹을 사용하려면 API 기본 URL이 필요합니다.',
      );
    }

    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') {
      throw new LeaderboardHttpError(
        'configuration',
        '이 환경에서는 fetch를 사용할 수 없습니다.',
      );
    }

    this.#baseUrl = normalizedBaseUrl;
    // Native browser fetch requires the Window receiver when stored on a
    // repository instance; injected test implementations retain the same call.
    this.#fetch = fetchImplementation.bind(globalThis);
  }

  async getTopEntries(query: LeaderboardQuery): Promise<LeaderboardEntry[]> {
    const validQuery = leaderboardQuerySchema.parse(query);
    const search = new URLSearchParams({
      topicId: validQuery.topicId,
      difficulty: validQuery.difficulty,
      dataVersion: validQuery.dataVersion,
      typingLanguage: validQuery.typingLanguage,
      answerPolicy: validQuery.answerPolicy,
      languageDataVersion: validQuery.languageDataVersion,
    });
    if (validQuery.answerLocale !== undefined) {
      search.set('answerLocale', validQuery.answerLocale);
    }
    const response = await this.#request(
      `${this.#baseUrl}/leaderboard?${search.toString()}`,
      { method: 'GET', headers: { Accept: 'application/json' } },
    );

    const payload = await this.#readJson(response);
    const parsedResponse = httpLeaderboardListResponseSchema.safeParse(payload);
    if (!parsedResponse.success) {
      throw new LeaderboardHttpError(
        'invalid-response',
        '랭킹 서버가 올바르지 않은 목록 응답을 반환했습니다.',
        { cause: parsedResponse.error },
      );
    }

    return selectTopLeaderboardEntries(parsedResponse.data.entries, validQuery);
  }

  async saveEntry(entry: LeaderboardEntry): Promise<void> {
    const validEntry = leaderboardEntrySchema.parse(entry);

    await this.#request(`${this.#baseUrl}/leaderboard`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validEntry),
    });
  }

  async #request(url: string, init: RequestInit): Promise<Response> {
    let response: Response;

    try {
      response = await this.#fetch(url, init);
    } catch (error) {
      throw new LeaderboardHttpError(
        'network',
        '랭킹 서버에 연결하지 못했습니다.',
        { cause: error },
      );
    }

    if (!response.ok) {
      throw new LeaderboardHttpError(
        'http',
        `랭킹 서버 요청이 실패했습니다. (HTTP ${response.status})`,
        { status: response.status },
      );
    }

    return response;
  }

  async #readJson(response: Response): Promise<unknown> {
    try {
      return (await response.json()) as unknown;
    } catch (error) {
      throw new LeaderboardHttpError(
        'invalid-response',
        '랭킹 서버 응답을 JSON으로 읽지 못했습니다.',
        { cause: error },
      );
    }
  }
}
