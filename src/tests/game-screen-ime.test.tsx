import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameAudio } from '../audio/gameAudio';
import { GameScreen } from '../components/game/GameScreen';
import type { GeoFeature } from '../geodata';
import { DIFFICULTIES } from '../game/config/difficulties';
import type { GameSession } from '../game/session';
import { useGameStore } from '../game/store/gameStore';

const feature: GeoFeature = {
  id: 'custom:admin2:gangnam',
  source: 'custom',
  sourceVersion: 'test-v1',
  featureType: 'admin2',
  name: 'Gangnam-gu',
  localizedNames: { ko: '강남구', en: 'Gangnam-gu' },
  names: [
    { locale: 'ko', script: 'Kore', value: '강남구', kind: 'localized', isPreferred: true },
    { locale: 'en', script: 'Latn', value: 'Gangnam-gu', kind: 'localized', isPreferred: true },
  ],
  aliases: ['강남'],
  geometry: { type: 'Polygon', coordinates: [[[127.02, 37.49], [127.08, 37.49], [127.08, 37.54], [127.02, 37.49]]] },
  centroid: [127.0473, 37.5172],
  bbox: [127.02, 37.49, 127.08, 37.54],
  parentIds: ['custom:admin1:seoul'],
  countryCode: 'KR',
  recommendedMinZoom: 9,
  recommendedMaxZoom: 14,
};

const session: GameSession = {
  id: 'scope:test-seoul:admin2',
  titleKo: '서울특별시 · 맞춤 범위',
  dataVersion: 'test-v1',
  root: feature,
  languageSettings: { uiLocale: 'ko', typingLanguage: 'ko', answerPolicy: 'strict' },
  resolvedAnswers: {
    [feature.id]: {
      target: '강남구',
      acceptedAnswers: ['강남구'],
      typingLanguage: 'ko',
      locale: 'ko',
      script: 'Kore',
      fallbackUsed: false,
    },
  },
  languageDataVersion: 'place-names-v1',
  scope: {
    rootFeatureId: feature.id,
    includedFeatureTypes: ['admin2'],
    includeDescendants: true,
    questionCount: 1,
    includeLandmarks: true,
    includeNaturalFeatures: true,
  },
};

const audio = {
  setMuted: vi.fn(),
  playCorrect: vi.fn(),
  playMiss: vi.fn(),
} as unknown as GameAudio;

function setQuestionPhase(phase: 'ready' | 'playing') {
  const now = performance.now();
  const durationMs = DIFFICULTIES.normal.timeLimitMs;
  useGameStore.setState({
    phase,
    phaseBeforePause: null,
    activeSession: session,
    features: [feature],
    currentIndex: 0,
    visited: [],
    questionResults: [],
    remainingMs: durationMs,
    deadlineMs: phase === 'playing' ? now + durationMs : 0,
    questionDurationMs: durationMs,
    questionStartedAt: phase === 'playing' ? now : 0,
    score: 0,
    streak: 0,
    maxStreak: 0,
    correctCount: 0,
    missCount: 0,
    currentHints: 0,
    totalHints: 0,
    questionResolved: false,
    lastMissReason: null,
    muted: true,
    reducedMotion: true,
    timeScale: 1,
  });
}

describe('GameScreen IME integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState({ phase: 'menu', activeSession: null, features: [], phaseBeforePause: null });
  });

  it('ignores Korean composition input and Enter until compositionend', async () => {
    setQuestionPhase('playing');
    render(<GameScreen audio={audio} />);
    const input = screen.getByRole('textbox', { name: '목표 지명 입력' });

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: '강남구' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: true });
    expect(useGameStore.getState().phase).toBe('playing');

    fireEvent.compositionEnd(input, { data: '구', target: { value: '강남구' } });
    await waitFor(() => expect(useGameStore.getState().phase).toBe('resolving-correct'));
    expect(useGameStore.getState().correctCount).toBe(1);
  });

  it('focuses the enabled input before starting the question timer', async () => {
    setQuestionPhase('ready');
    render(<GameScreen audio={audio} />);
    const input = screen.getByRole('textbox', { name: '목표 지명 입력' });

    expect(input).toBeEnabled();
    await waitFor(() => expect(useGameStore.getState().phase).toBe('playing'));
    expect(document.activeElement).toBe(input);
    expect(useGameStore.getState().deadlineMs).toBeGreaterThan(useGameStore.getState().questionStartedAt);
  });

  it('keeps the timer stopped after bounded retries and starts on a later confirmed focus', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    let nextFrameId = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const frameId = ++nextFrameId;
      callbacks.set(frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      callbacks.delete(frameId);
    });
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus').mockImplementation(() => undefined);

    setQuestionPhase('ready');
    render(<GameScreen audio={audio} />);

    for (let attempt = 0; attempt < 10 && callbacks.size > 0; attempt += 1) {
      const [frameId, callback] = callbacks.entries().next().value as [number, FrameRequestCallback];
      callbacks.delete(frameId);
      act(() => callback(performance.now()));
    }

    expect(focus).toHaveBeenCalledTimes(6);
    expect(callbacks.size).toBe(0);
    expect(useGameStore.getState().phase).toBe('ready');
    expect(useGameStore.getState().questionStartedAt).toBe(0);

    const input = screen.getByRole('textbox', { name: '목표 지명 입력' });
    focus.mockRestore();
    act(() => input.focus());

    expect(document.activeElement).toBe(input);
    expect(useGameStore.getState().phase).toBe('playing');
    expect(useGameStore.getState().questionStartedAt).toBeGreaterThan(0);
  });

  it('cancels a pending focus retry when the screen unmounts', () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callbacks.set(41, callback);
      return 41;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frameId) => {
      callbacks.delete(frameId);
    });

    setQuestionPhase('ready');
    const view = render(<GameScreen audio={audio} />);
    expect(callbacks.has(41)).toBe(true);

    view.unmount();

    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(callbacks.size).toBe(0);
    expect(useGameStore.getState().phase).toBe('ready');
  });

  it('reveals one hint at a time and records manual hint usage', () => {
    setQuestionPhase('playing');
    render(<GameScreen audio={audio} />);

    const hint = screen.getByRole('button', { name: '힌트 한 글자 · −150점' });
    expect(hint).toBeEnabled();
    expect(screen.queryByRole('button', { name: '음소거' })).toBeNull();

    fireEvent.click(hint);
    expect(useGameStore.getState()).toMatchObject({ currentHints: 1, totalHints: 1 });
    expect(screen.getByTestId('hint-mask').textContent?.startsWith('강')).toBe(true);

    fireEvent.click(hint);
    fireEvent.click(hint);
    expect(useGameStore.getState().currentHints).toBe(3);
    expect(hint).toBeDisabled();
  });

  it('lets the player reveal the answer and continue as a miss', () => {
    setQuestionPhase('playing');
    render(<GameScreen audio={audio} />);

    fireEvent.click(screen.getByRole('button', { name: '정답 보고 넘기기' }));
    expect(useGameStore.getState()).toMatchObject({
      phase: 'resolving-miss',
      missCount: 1,
      lastMissReason: 'wrong',
    });
    expect(screen.getByRole('status')).toHaveTextContent('강남구');
  });
});
