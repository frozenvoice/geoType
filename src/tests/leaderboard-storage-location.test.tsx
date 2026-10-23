import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultScreen } from '../components/result/ResultScreen';
import { createGameSession } from '../game/session';
import { useGameStore } from '../game/store/gameStore';
import type { GeoFeature } from '../geodata';
import { HttpLeaderboardRepository } from '../leaderboard/HttpLeaderboardRepository';
import { LocalStorageLeaderboardRepository } from '../leaderboard/LocalStorageLeaderboardRepository';

const root: GeoFeature = { id: 'test', source: 'custom', sourceVersion: 'test', featureType: 'country',
  name: 'Test', localizedNames: { ko: '테스트', en: 'Test' }, aliases: [], parentIds: [],
  geometry: { type: 'Point', coordinates: [0, 0] }, centroid: [0, 0], bbox: [0, 0, 0, 0],
  recommendedMinZoom: 0, recommendedMaxZoom: 5 };

describe('leaderboard storage disclosure', () => {
  afterEach(() => { cleanup(); useGameStore.setState(useGameStore.getInitialState()); });
  it('calls a native-style fetch with the global receiver', async () => {
    const fetch = vi.fn(function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response('{"entries":[]}'));
    });
    const repository = new HttpLeaderboardRepository('/fixture', { fetch });
    await expect(repository.getTopEntries({ topicId: 'test', difficulty: 'normal', dataVersion: 'test', typingLanguage: 'ko', answerPolicy: 'strict', languageDataVersion: 'test' })).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['ko', 'en'] as const)('describes the actual repository before saving in %s', (uiLocale) => {
    const session = createGameSession(root, { rootFeatureId: root.id, includedFeatureTypes: ['country'],
      includeDescendants: true, questionCount: 1, includeLandmarks: true, includeNaturalFeatures: true }, 'test',
    { languageSettings: { uiLocale, typingLanguage: 'en', answerPolicy: 'strict' } });
    useGameStore.setState({ activeSession: session, features: [root], phase: 'finished' });
    const remote = new HttpLeaderboardRepository('https://ranking.invalid', { fetch: vi.fn().mockResolvedValue(new Response('{"entries":[]}')) });
    const view = render(<ResultScreen repository={remote} />);
    expect(screen.getByText(uiLocale === 'ko' ? '서버 랭킹' : 'SERVER RANKING')).toBeInTheDocument();
    expect(screen.getByText(uiLocale === 'ko' ? /랭킹 서버로 전송/ : /sent to the configured ranking server/)).toBeInTheDocument();
    expect(screen.queryByText(uiLocale === 'ko' ? /이 브라우저에만/ : /stored safely in this browser/)).toBeNull();
    const local = new LocalStorageLeaderboardRepository({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
    view.rerender(<ResultScreen repository={local} />);
    expect(screen.getByText(uiLocale === 'ko' ? '로컬 랭킹' : 'LOCAL RANKING')).toBeInTheDocument();
    expect(screen.getByText(uiLocale === 'ko' ? /이 브라우저에만/ : /stored safely in this browser/)).toBeInTheDocument();
  });
});
