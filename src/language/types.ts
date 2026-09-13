export const UI_LOCALES = ['ko', 'en'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export const TYPING_LANGUAGES = [
  'ko',
  'en',
  'native',
  'romanized',
  'ja-kanji',
  'ja-reading',
] as const;

export type TypingLanguage = (typeof TYPING_LANGUAGES)[number];

export const ANSWER_POLICIES = ['strict', 'casual'] as const;

export type AnswerPolicy = (typeof ANSWER_POLICIES)[number];

export const NAME_KINDS = [
  'localized',
  'official',
  'short',
  'reading',
  'romanized',
  'historic',
  'alternate',
] as const;

export type NameKind = (typeof NAME_KINDS)[number];

/** A source-provided name. Values are display strings and are never rewritten. */
export type PlaceName = {
  locale: string;
  script?: string;
  value: string;
  kind: NameKind;
  isPreferred: boolean;
};

export type LanguageSettings = {
  uiLocale: UiLocale;
  typingLanguage: TypingLanguage;
  answerPolicy: AnswerPolicy;
};

export type ResolvedAnswer = {
  target: string;
  acceptedAnswers: string[];
  typingLanguage: TypingLanguage;
  locale: string;
  script?: string;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

export type CountryLanguageProfile = {
  countryCode: string;
  preferredLocales: string[];
  defaultNativeLocale: string;
};

/** Minimal name-bearing shape accepted by the language domain. */
export type LanguageNamedFeature = {
  names?: readonly PlaceName[];
  countryCode?: string;
};

export type PlaceNameDataWarningCode =
  | 'reading-hani-script'
  | 'romanized-without-latin'
  | 'multiple-preferred-names';

export type PlaceNameDataWarning = {
  code: PlaceNameDataWarningCode;
  message: string;
  indexes: number[];
};

export type LanguageScopeKind = 'world' | 'continent' | 'country' | 'subnational';

export type TypingLanguageAvailability = {
  typingLanguage: TypingLanguage;
  enabled: boolean;
  reason?: string;
};

