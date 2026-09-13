import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LeaderboardTable } from '../components/common/LeaderboardTable';
import type { LeaderboardEntry, LeaderboardQuery, LeaderboardRepository } from '../leaderboard';

const query: LeaderboardQuery = {
  topicId: 'test-topic',
  difficulty: 'normal',
  dataVersion: 'test-v1',
  typingLanguage: 'ko',
  answerPolicy: 'strict',
  languageDataVersion: 'place-names-v1',
};

function entry(id: string): LeaderboardEntry {
  return {
    id,
    nickname: id,
    topicId: query.topicId,
    topicTitle: '테스트',
    difficulty: query.difficulty,
    dataVersion: query.dataVersion,
    typingLanguage: query.typingLanguage,
    answerPolicy: query.answerPolicy,
    languageDataVersion: query.languageDataVersion,
    score: 100,
    correctCount: 1,
    missCount: 0,
    accuracy: 100,
    totalHints: 0,
    maxStreak: 1,
    elapsedMs: 1000,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('LeaderboardTable', () => {
  afterEach(() => cleanup());

  it('does not let a stale request overwrite a newer ranking response', async () => {
    let resolveFirst: ((value: LeaderboardEntry[]) => void) | undefined;
    const firstRequest = new Promise<LeaderboardEntry[]>((resolve) => { resolveFirst = resolve; });
    const repository: LeaderboardRepository = {
      getTopEntries: vi.fn()
        .mockReturnValueOnce(firstRequest)
        .mockResolvedValueOnce([entry('new')]),
      saveEntry: vi.fn(),
    };

    const view = render(<LeaderboardTable repository={repository} query={query} refreshToken={0} />);
    await waitFor(() => expect(screen.getByText('랭킹을 불러오는 중…')).toBeInTheDocument());

    view.rerender(<LeaderboardTable repository={repository} query={query} refreshToken={1} />);
    await waitFor(() => expect(screen.getByRole('row', { name: /new/ })).toBeInTheDocument());

    act(() => {
      resolveFirst?.([entry('old')]);
    });
    expect(screen.getByRole('row', { name: /new/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /old/ })).toBeNull();
  });

  it('offers a retry action when ranking loading fails', async () => {
    const repository: LeaderboardRepository = {
      getTopEntries: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([entry('retry')]),
      saveEntry: vi.fn(),
    };

    render(<LeaderboardTable repository={repository} query={query} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument());
    screen.getByRole('button', { name: '다시 시도' }).click();
    await waitFor(() => expect(screen.getByRole('row', { name: /retry/ })).toBeInTheDocument());
  });
});
