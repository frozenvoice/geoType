import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DIFFICULTY_ID,
  DIFFICULTIES,
  getDifficultyMenuLabel,
} from '../game/config/difficulties';
import {
  getAcceptedAnswers,
  isAcceptedAnswer,
  normalizeAnswer,
} from '../game/engine/answerNormalizer';
import {
  buildHintMask,
  createHintState,
  fallbackSegmentGraphemes,
  getHintMaskGraphemes,
  getLongestCorrectPrefixLength,
  getNextHintRevealCount,
  isHintDue,
  resetHintInactivity,
  revealNextHint,
  segmentGraphemes,
} from '../game/engine/hints';

describe('answer normalization', () => {
  it('normalizes Unicode to NFC and collapses surrounding/duplicate spaces', () => {
    expect(normalizeAnswer('  se\u0301oul\t  station  ')).toBe(
      'séoul station',
    );
    expect(normalizeAnswer('서울')).toBe('서울');
  });

  it('compares Latin letters without case and accepts normalized aliases', () => {
    expect(isAcceptedAnswer('SEOUL', '서울', ['Seoul', '서울특별시'])).toBe(true);
    expect(
      isAcceptedAnswer(' 서울  특별시 ', {
        nameKo: '서울',
        aliases: ['서울 특별시'],
      }),
    ).toBe(true);
    expect(isAcceptedAnswer('', '서울', [''])).toBe(false);
    expect(getAcceptedAnswers('서울', ['SEOUL', 'seoul']).size).toBe(2);
  });
});

describe('grapheme-aware hints', () => {
  it('segments composed characters and joined emoji as single graphemes', () => {
    expect(segmentGraphemes('가👍🏽👨‍👩‍👧‍👦')).toEqual([
      '가',
      '👍🏽',
      '👨‍👩‍👧‍👦',
    ]);
    expect(fallbackSegmentGraphemes('e\u0301👍🏽')).toEqual(['é', '👍🏽']);
  });

  it('reveals the first letter and advances after a correct prefix', () => {
    expect(getNextHintRevealCount('서울역', '', 0)).toBe(1);
    expect(buildHintMask('서울역', 0)).toBe('_ _ _');
    expect(buildHintMask('서울역', 1)).toBe('서 _ _');
    expect(getLongestCorrectPrefixLength('서울역', '서울')).toBe(2);
    expect(getNextHintRevealCount('서울역', '서울', 1)).toBe(3);
    expect(buildHintMask('서울역', 3)).toBe('서 울 역');
  });

  it('shows spaces and punctuation without spending a hint', () => {
    expect(getHintMaskGraphemes('서울-역 앞', 2)).toEqual([
      '서',
      '울',
      '-',
      '_',
      ' ',
      '_',
    ]);
  });

  it('schedules hints from inactivity and resets after input', () => {
    const config = DIFFICULTIES.normal;
    const initial = createHintState(config, 1_000);
    expect(initial.nextHintAtMs).toBe(8_000);
    expect(isHintDue(initial, 7_999)).toBe(false);
    expect(isHintDue(initial, 8_000)).toBe(true);

    const first = revealNextHint(initial, config, '서울역', '', 8_000);
    expect(first).toMatchObject({
      revealedGraphemeCount: 1,
      hintCount: 1,
      nextHintAtMs: 13_000,
    });
    expect(resetHintInactivity(first, config, 9_000).nextHintAtMs).toBe(
      14_000,
    );
  });

  it('never schedules or reveals automatic hints on expert', () => {
    const initial = createHintState(DIFFICULTIES.expert, 0);
    expect(initial.nextHintAtMs).toBeNull();
    expect(
      revealNextHint(initial, DIFFICULTIES.expert, '서울', '', 10_000),
    ).toBe(initial);
  });
});

describe('difficulty configuration', () => {
  it('matches the product timing and multiplier rules exactly', () => {
    expect(DIFFICULTIES.easy).toMatchObject({
      timeLimitMs: 45_000,
      firstHintDelayMs: 4_000,
      subsequentHintDelayMs: 3_000,
      scoreMultiplier: 1,
    });
    expect(DIFFICULTIES.normal).toMatchObject({
      timeLimitMs: 30_000,
      firstHintDelayMs: 7_000,
      subsequentHintDelayMs: 5_000,
      scoreMultiplier: 1.5,
    });
    expect(DIFFICULTIES.hard).toMatchObject({
      timeLimitMs: 20_000,
      firstHintDelayMs: 10_000,
      subsequentHintDelayMs: 7_000,
      scoreMultiplier: 2,
    });
    expect(DIFFICULTIES.expert).toMatchObject({
      timeLimitMs: 12_000,
      firstHintDelayMs: null,
      subsequentHintDelayMs: null,
      scoreMultiplier: 3,
    });
  });

  it('keeps normal as the default and exposes menu labels with seconds', () => {
    expect(DEFAULT_DIFFICULTY_ID).toBe('normal');
    expect(getDifficultyMenuLabel('easy')).toBe('쉬움 · 45초');
    expect(getDifficultyMenuLabel('normal')).toBe('보통 · 30초');
    expect(getDifficultyMenuLabel('hard')).toBe('어려움 · 20초');
    expect(getDifficultyMenuLabel('expert')).toBe('전문가 · 12초');
  });
});
