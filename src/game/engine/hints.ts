import type { DifficultyConfig } from '../config/difficulties';
import { normalizeAnswer } from './answerNormalizer';

const COMBINING_MARK_PATTERN = /^\p{Mark}$/u;
const AUTO_REVEALED_PATTERN = /^[\p{White_Space}\p{Punctuation}]$/u;
const REGIONAL_INDICATOR_PATTERN = /^\p{Regional_Indicator}$/u;
const EMOJI_MODIFIER_PATTERN = /^\p{Emoji_Modifier}$/u;
const VARIATION_SELECTOR_PATTERN = /^[\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]$/u;
const ZERO_WIDTH_JOINER = '\u200d';

function isRegionalIndicatorPair(cluster: string, grapheme: string): boolean {
  if (!REGIONAL_INDICATOR_PATTERN.test(grapheme)) {
    return false;
  }

  const indicators = Array.from(cluster).filter((value) =>
    REGIONAL_INDICATOR_PATTERN.test(value),
  );
  return indicators.length === 1;
}

/** A dependency-free fallback for environments without Intl.Segmenter. */
export function fallbackSegmentGraphemes(value: string): string[] {
  const clusters: string[] = [];

  for (const codePoint of Array.from(value.normalize('NFC'))) {
    const lastIndex = clusters.length - 1;
    const previous = clusters[lastIndex];

    if (previous === undefined) {
      clusters.push(codePoint);
      continue;
    }

    const joinsPrevious =
      COMBINING_MARK_PATTERN.test(codePoint) ||
      VARIATION_SELECTOR_PATTERN.test(codePoint) ||
      EMOJI_MODIFIER_PATTERN.test(codePoint) ||
      codePoint === ZERO_WIDTH_JOINER ||
      previous.endsWith(ZERO_WIDTH_JOINER) ||
      isRegionalIndicatorPair(previous, codePoint);

    if (joinsPrevious) {
      clusters[lastIndex] = `${previous}${codePoint}`;
    } else {
      clusters.push(codePoint);
    }
  }

  return clusters;
}

export function segmentGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(value.normalize('NFC')), ({ segment }) =>
      segment,
    );
  }

  return fallbackSegmentGraphemes(value);
}

export function isAutoRevealedGrapheme(grapheme: string): boolean {
  return AUTO_REVEALED_PATTERN.test(grapheme);
}

export function getRevealableGraphemeCount(answer: string): number {
  return segmentGraphemes(answer).filter(
    (grapheme) => !isAutoRevealedGrapheme(grapheme),
  ).length;
}

export function getLongestCorrectPrefixLength(
  answer: string,
  input: string,
): number {
  const answerGraphemes = segmentGraphemes(normalizeAnswer(answer));
  const inputGraphemes = segmentGraphemes(normalizeAnswer(input));
  const comparisonLength = Math.min(
    answerGraphemes.length,
    inputGraphemes.length,
  );
  let prefixLength = 0;

  while (
    prefixLength < comparisonLength &&
    answerGraphemes[prefixLength] === inputGraphemes[prefixLength]
  ) {
    prefixLength += 1;
  }

  return prefixLength;
}

export function getCorrectPrefixRevealableCount(
  answer: string,
  input: string,
): number {
  const answerGraphemes = segmentGraphemes(normalizeAnswer(answer));
  const prefixLength = getLongestCorrectPrefixLength(answer, input);
  return answerGraphemes
    .slice(0, prefixLength)
    .filter((grapheme) => !isAutoRevealedGrapheme(grapheme)).length;
}

export function getNextHintRevealCount(
  answer: string,
  input: string,
  currentRevealCount: number,
): number {
  const total = getRevealableGraphemeCount(answer);
  const correctPrefix = getCorrectPrefixRevealableCount(answer, input);
  const next = Math.max(0, currentRevealCount, correctPrefix) + 1;
  return Math.min(total, next);
}

export function getHintMaskGraphemes(
  answer: string,
  revealedGraphemeCount: number,
): string[] {
  let revealableIndex = 0;
  const safeRevealCount = Math.max(0, Math.floor(revealedGraphemeCount));

  return segmentGraphemes(answer).map((grapheme) => {
    if (isAutoRevealedGrapheme(grapheme)) {
      return grapheme;
    }

    const isRevealed = revealableIndex < safeRevealCount;
    revealableIndex += 1;
    return isRevealed ? grapheme : '_';
  });
}

export function buildHintMask(
  answer: string,
  revealedGraphemeCount: number,
  separator = ' ',
): string {
  return getHintMaskGraphemes(answer, revealedGraphemeCount).join(separator);
}

export interface HintState {
  readonly revealedGraphemeCount: number;
  readonly hintCount: number;
  readonly nextHintAtMs: number | null;
}

function getHintDelay(
  config: DifficultyConfig,
  hintCount: number,
): number | null {
  return hintCount === 0
    ? config.firstHintDelayMs
    : config.subsequentHintDelayMs;
}

export function createHintState(
  config: DifficultyConfig,
  nowMs: number,
): HintState {
  const delay = getHintDelay(config, 0);
  return {
    revealedGraphemeCount: 0,
    hintCount: 0,
    nextHintAtMs: delay === null ? null : nowMs + delay,
  };
}

export function resetHintInactivity(
  state: HintState,
  config: DifficultyConfig,
  nowMs: number,
): HintState {
  const delay = getHintDelay(config, state.hintCount);
  return {
    ...state,
    nextHintAtMs: delay === null ? null : nowMs + delay,
  };
}

export function isHintDue(state: HintState, nowMs: number): boolean {
  return state.nextHintAtMs !== null && nowMs >= state.nextHintAtMs;
}

export function revealNextHint(
  state: HintState,
  config: DifficultyConfig,
  answer: string,
  input: string,
  nowMs: number,
): HintState {
  if (config.firstHintDelayMs === null) {
    return state;
  }

  const nextRevealCount = getNextHintRevealCount(
    answer,
    input,
    state.revealedGraphemeCount,
  );

  if (nextRevealCount <= state.revealedGraphemeCount) {
    return { ...state, nextHintAtMs: null };
  }

  const nextHintCount = state.hintCount + 1;
  const delay = getHintDelay(config, nextHintCount);
  const isFullyRevealed =
    nextRevealCount >= getRevealableGraphemeCount(answer);

  return {
    revealedGraphemeCount: nextRevealCount,
    hintCount: nextHintCount,
    nextHintAtMs:
      delay === null || isFullyRevealed ? null : nowMs + delay,
  };
}
