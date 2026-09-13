import type { AnswerPolicy, TypingLanguage, UiLocale } from './types';

const TYPING_LANGUAGE_LABELS: Readonly<
  Record<UiLocale, Readonly<Record<TypingLanguage, string>>>
> = {
  ko: {
    ko: '한국어',
    en: 'English',
    native: '현지어',
    romanized: '로마자',
    'ja-kanji': '일본어 한자',
    'ja-reading': '일본어 읽기',
  },
  en: {
    ko: 'Korean',
    en: 'English',
    native: 'Native',
    romanized: 'Romanized',
    'ja-kanji': 'Japanese Kanji',
    'ja-reading': 'Japanese Reading',
  },
};

const ANSWER_POLICY_LABELS: Readonly<
  Record<UiLocale, Readonly<Record<AnswerPolicy, string>>>
> = {
  ko: { strict: '지정된 언어만', casual: '다른 표기와 별칭도 허용' },
  en: { strict: 'Selected language only', casual: 'Allow registered alternatives' },
};

export function getTypingLanguageLabel(
  typingLanguage: TypingLanguage,
  uiLocale: UiLocale,
): string {
  return TYPING_LANGUAGE_LABELS[uiLocale][typingLanguage];
}

export function getAnswerPolicyLabel(answerPolicy: AnswerPolicy, uiLocale: UiLocale): string {
  return ANSWER_POLICY_LABELS[uiLocale][answerPolicy];
}

