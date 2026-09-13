import { GameAudio } from '../audio/gameAudio';
import { HttpLeaderboardRepository } from '../leaderboard/HttpLeaderboardRepository';
import { LocalStorageLeaderboardRepository } from '../leaderboard/LocalStorageLeaderboardRepository';
import type { LeaderboardRepository } from '../leaderboard/LeaderboardRepository';

function createLeaderboardRepository(): LeaderboardRepository {
  const mode: unknown = import.meta.env.VITE_LEADERBOARD_MODE;
  const baseUrl: unknown = import.meta.env.VITE_API_BASE_URL;
  if (mode === 'http' && typeof baseUrl === 'string' && baseUrl.length > 0) {
    return new HttpLeaderboardRepository(baseUrl);
  }
  return new LocalStorageLeaderboardRepository();
}

export const leaderboardRepository = createLeaderboardRepository();
export const gameAudio = new GameAudio();
