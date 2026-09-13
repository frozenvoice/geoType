import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameAudio } from '../audio/gameAudio';
import { GameScreen } from '../components/game/GameScreen';
import { DIFFICULTIES } from '../game/config/difficulties';
import type { GameSession } from '../game/session';
import { useGameStore } from '../game/store/gameStore';
import type { GeoFeature } from '../geodata';

const japan: GeoFeature = {
  id: 'natural-earth:country:JPN',
  source: 'natural-earth',
  sourceVersion: 'test-v1',
  featureType: 'country',
  name: 'Japan',
  localizedNames: { ko: '일본', en: 'Japan' },
  names: [
    { locale: 'ko', script: 'Kore', value: '일본', kind: 'localized', isPreferred: true },
    { locale: 'en', script: 'Latn', value: 'Japan', kind: 'localized', isPreferred: true },
    { locale: 'ja', script: 'Hani', value: '日本', kind: 'official', isPreferred: true },
    { locale: 'ja', script: 'Hira', value: 'にほん', kind: 'reading', isPreferred: true },
  ],
  aliases: [],
  geometry: {
    type: 'Polygon',
    coordinates: [[[138, 34], [141, 34], [141, 38], [138, 34]]],
  },
  centroid: [139.69, 35.68],
  bbox: [138, 34, 141, 38],
  parentIds: ['natural-earth:continent:asia'],
  countryCode: 'JP',
  countryCodeAlpha3: 'JPN',
  recommendedMinZoom: 2,
  recommendedMaxZoom: 6,
};

const session: GameSession = {
  id: 'scope:test-japan:country',
  titleKo: '일본 · 국가',
  dataVersion: 'test-v1',
  root: japan,
  languageSettings: {
    uiLocale: 'ko',
    typingLanguage: 'ja-kanji',
    answerPolicy: 'strict',
  },
  resolvedAnswers: {
    [japan.id]: {
      target: '日本',
      acceptedAnswers: ['日本'],
      typingLanguage: 'ja-kanji',
      locale: 'ja',
      script: 'Hani',
      fallbackUsed: false,
    },
  },
  languageDataVersion: 'place-names-v1',
  scope: {
    rootFeatureId: japan.id,
    includedFeatureTypes: ['country'],
    includeDescendants: true,
    questionCount: 1,
    includeLandmarks: false,
    includeNaturalFeatures: false,
  },
};

const audio = {
  setMuted: vi.fn(),
  playCorrect: vi.fn(),
  playMiss: vi.fn(),
} as unknown as GameAudio;

function setPlayingQuestion() {
  const now = performance.now();
  const durationMs = DIFFICULTIES.normal.timeLimitMs;
  useGameStore.setState({
    phase: 'playing',
    phaseBeforePause: null,
    activeSession: session,
    features: [japan],
    currentIndex: 0,
    visited: [],
    questionResults: [],
    remainingMs: durationMs,
    deadlineMs: now + durationMs,
    questionDurationMs: durationMs,
    questionStartedAt: now,
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

describe('GameScreen Japanese IME integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPlayingQuestion();
  });

  afterEach(() => {
    cleanup();
    useGameStore.setState({
      phase: 'menu',
      activeSession: null,
      features: [],
      phaseBeforePause: null,
    });
  });

  it('does not grade converted kanji or Enter before compositionend', async () => {
    render(<GameScreen audio={audio} />);
    const input = screen.getByRole('textbox');
    expect(input).toHaveAttribute('lang', 'ja');

    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: '日本' } });
    expect(useGameStore.getState()).toMatchObject({
      phase: 'playing',
      correctCount: 0,
      missCount: 0,
    });

    fireEvent.keyDown(input, {
      key: 'Enter',
      code: 'Enter',
      keyCode: 229,
      isComposing: true,
    });
    expect(useGameStore.getState()).toMatchObject({
      phase: 'playing',
      correctCount: 0,
      missCount: 0,
    });

    fireEvent.compositionEnd(input, {
      data: '日本',
      target: { value: '日本' },
    });
    await waitFor(() => {
      expect(useGameStore.getState()).toMatchObject({
        phase: 'resolving-correct',
        correctCount: 1,
        missCount: 0,
      });
    });
  }, 10_000);
});
