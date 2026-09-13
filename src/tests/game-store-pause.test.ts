import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GameSession } from '../game/session';
import { useGameStore } from '../game/store/gameStore';

const feature = {
  id: 'custom:city:test',
  source: 'custom' as const,
  sourceVersion: 'test-v1',
  featureType: 'city' as const,
  name: 'Test',
  localizedNames: { ko: '테스트' },
  aliases: [],
  geometry: { type: 'Point' as const, coordinates: [127, 37] as [number, number] },
  centroid: [127, 37] as [number, number],
  bbox: [127, 37, 127, 37] as [number, number, number, number],
  parentIds: [],
  recommendedMinZoom: 8,
  recommendedMaxZoom: 14,
};

const session: GameSession = {
  id: 'scope:test:city',
  titleKo: '테스트 · 도시',
  dataVersion: 'test-v1',
  root: feature,
  scope: {
    rootFeatureId: feature.id,
    includedFeatureTypes: ['city'],
    includeDescendants: false,
    questionCount: 1,
    includeLandmarks: false,
    includeNaturalFeatures: false,
  },
  languageSettings: { uiLocale: 'ko', typingLanguage: 'ko', answerPolicy: 'strict' },
  resolvedAnswers: {},
  languageDataVersion: 'place-names-v1',
};

describe('game store flight pause handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState({
      phase: 'menu',
      phaseBeforePause: null,
      runId: 0,
      pausedAt: null,
      totalPausedMs: 0,
      resumeNotice: false,
      difficulty: 'normal',
    });
  });

  it('remembers a completed camera flight while the pause overlay is open', () => {
    useGameStore.setState({ phase: 'flying', phaseBeforePause: null });

    useGameStore.getState().pause(false, 100);
    expect(useGameStore.getState()).toMatchObject({ phase: 'paused', phaseBeforePause: 'flying' });

    useGameStore.getState().cameraArrived();
    expect(useGameStore.getState()).toMatchObject({ phase: 'paused', phaseBeforePause: 'ready' });

    useGameStore.getState().resume(200);
    expect(useGameStore.getState()).toMatchObject({ phase: 'ready', phaseBeforePause: null });
  });

  it('gives timeout precedence when an answer arrives at the deadline', () => {
    useGameStore.setState({
      phase: 'playing',
      features: [feature],
      currentIndex: 0,
      questionResolved: false,
      deadlineMs: 1_000,
      remainingMs: 10,
      questionDurationMs: 1_000,
      questionStartedAt: 0,
      score: 0,
      streak: 0,
      maxStreak: 0,
      correctCount: 0,
      missCount: 0,
      currentHints: 0,
      totalHints: 0,
      visited: [],
      questionResults: [],
    });

    expect(useGameStore.getState().resolveQuestion('correct', 1_000)).toBe(true);
    expect(useGameStore.getState()).toMatchObject({
      phase: 'resolving-miss',
      lastMissReason: 'timeout',
      score: 0,
      correctCount: 0,
      missCount: 1,
    });
  });

  it('increments the run token and clears pause accounting when a game starts', () => {
    useGameStore.setState({
      phase: 'finished',
      runId: 8,
      pausedAt: 2_000,
      totalPausedMs: 4_000,
    });

    useGameStore.getState().startGame(session, [feature], { deterministic: true });

    expect(useGameStore.getState()).toMatchObject({
      phase: 'flying',
      runId: 9,
      pausedAt: null,
      totalPausedMs: 0,
    });
  });

  it('accumulates manual pause time and preserves the playing deadline', () => {
    useGameStore.setState({
      phase: 'playing',
      phaseBeforePause: null,
      remainingMs: 500,
      deadlineMs: 1_000,
      pausedAt: null,
      totalPausedMs: 100,
    });

    useGameStore.getState().pause(false, 500);
    expect(useGameStore.getState()).toMatchObject({
      phase: 'paused',
      phaseBeforePause: 'playing',
      pausedAt: 500,
      remainingMs: 500,
    });

    useGameStore.getState().resume(750);
    expect(useGameStore.getState()).toMatchObject({
      phase: 'playing',
      phaseBeforePause: null,
      pausedAt: null,
      totalPausedMs: 350,
      deadlineMs: 1_250,
    });
  });

  it('pauses and resumes a resolution animation without advancing it', () => {
    useGameStore.setState({
      phase: 'resolving-correct',
      phaseBeforePause: null,
      remainingMs: 200,
      pausedAt: null,
      totalPausedMs: 0,
    });

    useGameStore.getState().pause(false, 100);
    expect(useGameStore.getState()).toMatchObject({
      phase: 'paused',
      phaseBeforePause: 'resolving-correct',
    });

    useGameStore.getState().resume(400);
    expect(useGameStore.getState()).toMatchObject({
      phase: 'resolving-correct',
      phaseBeforePause: null,
      totalPausedMs: 300,
    });
  });

  it('does not start the question timer while the document is hidden', () => {
    useGameStore.setState({
      phase: 'ready',
      questionStartedAt: 0,
      deadlineMs: 0,
    });
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    useGameStore.getState().startQuestion(100);

    expect(useGameStore.getState()).toMatchObject({
      phase: 'ready',
      questionStartedAt: 0,
      deadlineMs: 0,
    });
  });

  it('only accepts difficulty changes outside an active run', () => {
    useGameStore.setState({ phase: 'playing', difficulty: 'normal' });
    useGameStore.getState().setDifficulty('hard');
    expect(useGameStore.getState().difficulty).toBe('normal');

    useGameStore.setState({ phase: 'menu' });
    useGameStore.getState().setDifficulty('hard');
    expect(useGameStore.getState().difficulty).toBe('hard');
  });
});
