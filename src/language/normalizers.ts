import type { TypingLanguage } from './types';

const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\u2060\uFEFF]/gu;
const WHITESPACE_PATTERN = /\s+/gu;
const MARK_PATTERN = /\p{Mark}/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;

export type AnswerNormalizationOptions = {
  romanizedDiacriticInsensitive?: boolean;
  japaneseKanaInsensitive?: boolean;
};

/**
 * Applies only comparison-safe normalization. It does not transliterate or
 * convert between writing systems such as simplified and traditional Chinese.
 */
export function normalizeCommon(value: string): string {
  return value
    .normalize('NFC')
    .replace(ZERO_WIDTH_PATTERN, '')
    .trim()
    .replace(WHITESPACE_PATTERN, ' ')
    .toLowerCase();
}

/** Preserves display casing while applying the storage normalization rules. */
export function normalizePlaceNameValue(value: string): string {
  return value
    .normalize('NFC')
    .replace(ZERO_WIDTH_PATTERN, '')
    .trim()
    .replace(WHITESPACE_PATTERN, ' ');
}

function removeLatinDiacritics(value: string): string {
  let previousBaseWasLatin = false;
  let output = '';

  for (const character of value.normalize('NFD')) {
    if (MARK_PATTERN.test(character)) {
      if (!previousBaseWasLatin) output += character;
      continue;
    }

    previousBaseWasLatin = LATIN_PATTERN.test(character);
    output += character;
  }

  return output.normalize('NFC');
}

export function normalizeLatin(
  value: string,
  options: { removeDiacritics?: boolean } = {},
): string {
  const normalized = normalizeCommon(value);
  return options.removeDiacritics === true
    ? removeLatinDiacritics(normalized)
    : normalized;
}

function katakanaToHiragana(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= 0x30a1 && codePoint <= 0x30f6) {
      result += String.fromCodePoint(codePoint - 0x60);
    } else if (codePoint === 0x30fd || codePoint === 0x30fe) {
      result += String.fromCodePoint(codePoint - 0x60);
    } else {
      result += character;
    }
  }
  return result;
}

export function normalizeJapaneseReading(
  value: string,
  options: { foldKatakanaToHiragana?: boolean } = {},
): string {
  const normalized = normalizeCommon(value);
  return options.foldKatakanaToHiragana === false
    ? normalized
    : katakanaToHiragana(normalized);
}

export function normalizeForAnswerMode(
  value: string,
  typingLanguage: TypingLanguage,
  options: AnswerNormalizationOptions = {},
): string {
  switch (typingLanguage) {
    case 'romanized':
      return normalizeLatin(value, {
        removeDiacritics: options.romanizedDiacriticInsensitive !== false,
      });
    case 'en':
      return normalizeLatin(value);
    case 'ja-reading':
      return normalizeJapaneseReading(value, {
        foldKatakanaToHiragana: options.japaneseKanaInsensitive !== false,
      });
    default:
      return normalizeCommon(value);
  }
}

