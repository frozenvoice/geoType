import {
  COUNTRY_LANGUAGE_PROFILES,
  getCountryLanguageProfile,
  getOrderedNativeLocales,
} from './profiles';
import { normalizeCommon, normalizeForAnswerMode, type AnswerNormalizationOptions } from './normalizers';
import type {
  CountryLanguageProfile,
  LanguageNamedFeature,
  LanguageSettings,
  NameKind,
  PlaceName,
  ResolvedAnswer,
  TypingLanguage,
} from './types';

const STRICT_GENERAL_KINDS = new Set<NameKind>(['localized', 'official', 'short']);
const CASUAL_KINDS = new Set<NameKind>([
  'localized',
  'official',
  'short',
  'reading',
  'romanized',
  'alternate',
]);
const JAPANESE_KANJI_SCRIPTS = new Set(['Hani', 'Jpan']);
const JAPANESE_READING_SCRIPTS = new Set(['Hira', 'Kana']);

export type ResolveAnswerOptions = {
  countryLanguageProfiles?: Readonly<Record<string, CountryLanguageProfile>>;
  includeHistoricInCasual?: boolean;
};

type TargetSelection = {
  name: PlaceName;
  fallbackUsed: boolean;
  fallbackReason?: string;
};

function languageOf(locale: string): string {
  try {
    return new Intl.Locale(locale).language.toLowerCase();
  } catch {
    return locale.split('-')[0]?.toLowerCase() ?? locale.toLowerCase();
  }
}

function localeMatchesProfile(nameLocale: string, profileLocale: string): boolean {
  try {
    const canonicalName = Intl.getCanonicalLocales(nameLocale)[0]?.toLowerCase();
    const canonicalProfile = Intl.getCanonicalLocales(profileLocale)[0]?.toLowerCase();
    if (!canonicalName || !canonicalProfile) return false;
    return canonicalProfile.includes('-')
      ? canonicalName === canonicalProfile
      : languageOf(canonicalName) === languageOf(canonicalProfile);
  } catch {
    return nameLocale.toLowerCase() === profileLocale.toLowerCase();
  }
}

function firstMatching(
  names: readonly PlaceName[],
  predicates: readonly ((name: PlaceName) => boolean)[],
): PlaceName | null {
  for (const predicate of predicates) {
    const match = names.find(predicate);
    if (match) return match;
  }
  return null;
}

function selectKorean(names: readonly PlaceName[]): TargetSelection | null {
  const isKorean = (name: PlaceName): boolean =>
    languageOf(name.locale) === 'ko' &&
    name.kind !== 'romanized' &&
    name.script !== 'Latn';
  const name = firstMatching(names, [
    (candidate) => isKorean(candidate) && candidate.isPreferred && candidate.kind === 'localized',
    (candidate) => isKorean(candidate) && candidate.isPreferred,
    (candidate) => isKorean(candidate) && candidate.kind === 'short',
  ]);
  return name ? { name, fallbackUsed: false } : null;
}

function selectEnglish(names: readonly PlaceName[]): TargetSelection | null {
  const isEnglish = (name: PlaceName): boolean => languageOf(name.locale) === 'en';
  const english = firstMatching(names, [
    (candidate) => isEnglish(candidate) && candidate.isPreferred,
    (candidate) => isEnglish(candidate) && candidate.kind === 'localized',
    (candidate) => isEnglish(candidate) && candidate.kind === 'short',
  ]);
  if (english) return { name: english, fallbackUsed: false };

  const romanized = firstMatching(names, [
    (candidate) => candidate.kind === 'romanized' && candidate.isPreferred,
    (candidate) => candidate.kind === 'romanized',
  ]);
  return romanized
    ? {
        name: romanized,
        fallbackUsed: true,
        fallbackReason: 'english-used-registered-romanized-name',
      }
    : null;
}

function nativeNameForLocale(
  names: readonly PlaceName[],
  locale: string,
): PlaceName | null {
  const matchesLocale = (name: PlaceName): boolean => localeMatchesProfile(name.locale, locale);
  return firstMatching(names, [
    (candidate) => matchesLocale(candidate) && candidate.kind === 'official' && candidate.isPreferred,
    (candidate) => matchesLocale(candidate) && candidate.kind === 'localized' && candidate.isPreferred,
    (candidate) => matchesLocale(candidate) && candidate.kind === 'short' && candidate.isPreferred,
    (candidate) => matchesLocale(candidate) && candidate.kind === 'official',
    (candidate) => matchesLocale(candidate) && candidate.kind === 'localized',
    (candidate) => matchesLocale(candidate) && candidate.kind === 'short',
  ]);
}

function selectNative(
  feature: LanguageNamedFeature,
  names: readonly PlaceName[],
  profiles: Readonly<Record<string, CountryLanguageProfile>>,
): TargetSelection | null {
  const profile = getCountryLanguageProfile(feature.countryCode, profiles);
  if (!profile) return null;

  const locales = getOrderedNativeLocales(profile);
  for (const [index, locale] of locales.entries()) {
    const name = nativeNameForLocale(names, locale);
    if (name) {
      return index === 0
        ? { name, fallbackUsed: false }
        : {
            name,
            fallbackUsed: true,
            fallbackReason: `native-used-secondary-preferred-locale:${locale}`,
          };
    }
  }
  return null;
}

function selectJapaneseKanji(names: readonly PlaceName[]): TargetSelection | null {
  const isJapanese = (name: PlaceName): boolean => languageOf(name.locale) === 'ja';
  const hasKanjiScript = (name: PlaceName): boolean =>
    name.script === undefined || JAPANESE_KANJI_SCRIPTS.has(name.script);
  const primary = firstMatching(names, [
    (candidate) =>
      isJapanese(candidate) &&
      candidate.kind === 'official' &&
      JAPANESE_KANJI_SCRIPTS.has(candidate.script ?? ''),
    (candidate) =>
      isJapanese(candidate) &&
      candidate.kind === 'short' &&
      JAPANESE_KANJI_SCRIPTS.has(candidate.script ?? ''),
  ]);
  if (primary) return { name: primary, fallbackUsed: false };

  const preferred = names.find(
    (candidate) => isJapanese(candidate) && candidate.isPreferred && hasKanjiScript(candidate),
  );
  return preferred
    ? {
        name: preferred,
        fallbackUsed: true,
        fallbackReason: 'japanese-kanji-used-preferred-name-without-specific-kind',
      }
    : null;
}

function selectJapaneseReading(names: readonly PlaceName[]): TargetSelection | null {
  const isJapaneseReading = (name: PlaceName): boolean =>
    languageOf(name.locale) === 'ja' && name.kind === 'reading';
  const name = firstMatching(names, [
    (candidate) => isJapaneseReading(candidate) && candidate.script === 'Hira',
    (candidate) => isJapaneseReading(candidate) && candidate.script === 'Kana',
  ]);
  return name ? { name, fallbackUsed: false } : null;
}

function selectRomanized(names: readonly PlaceName[]): TargetSelection | null {
  const romanized = names.find(
    (candidate) => candidate.kind === 'romanized' && candidate.isPreferred,
  );
  if (romanized) return { name: romanized, fallbackUsed: false };

  const english = names.find(
    (candidate) => languageOf(candidate.locale) === 'en' && candidate.isPreferred,
  );
  if (english) {
    return {
      name: english,
      fallbackUsed: true,
      fallbackReason: 'romanized-used-preferred-english-name',
    };
  }

  const latin = names.find(
    (candidate) => candidate.script === 'Latn' && candidate.isPreferred,
  );
  return latin
    ? {
        name: latin,
        fallbackUsed: true,
        fallbackReason: 'romanized-used-preferred-latin-name',
      }
    : null;
}

function selectTarget(
  feature: LanguageNamedFeature,
  settings: LanguageSettings,
  profiles: Readonly<Record<string, CountryLanguageProfile>>,
): TargetSelection | null {
  const names = feature.names ?? [];
  switch (settings.typingLanguage) {
    case 'ko':
      return selectKorean(names);
    case 'en':
      return selectEnglish(names);
    case 'native':
      return selectNative(feature, names, profiles);
    case 'ja-kanji':
      return selectJapaneseKanji(names);
    case 'ja-reading':
      return selectJapaneseReading(names);
    case 'romanized':
      return selectRomanized(names);
  }
}

function strictNames(
  names: readonly PlaceName[],
  selected: PlaceName,
  typingLanguage: TypingLanguage,
): PlaceName[] {
  const selectedLanguage = languageOf(selected.locale);
  switch (typingLanguage) {
    case 'ko':
      return names.filter(
        (name) =>
          languageOf(name.locale) === 'ko' &&
          name.script !== 'Latn' &&
          STRICT_GENERAL_KINDS.has(name.kind),
      );
    case 'en':
      return selectedLanguage === 'en'
        ? names.filter(
            (name) => languageOf(name.locale) === 'en' && STRICT_GENERAL_KINDS.has(name.kind),
          )
        : names.filter((name) => name.kind === 'romanized');
    case 'native':
      return names.filter(
        (name) =>
          localeMatchesProfile(name.locale, selected.locale) && STRICT_GENERAL_KINDS.has(name.kind),
      );
    case 'ja-kanji':
      return names.filter(
        (name) =>
          languageOf(name.locale) === 'ja' &&
          JAPANESE_KANJI_SCRIPTS.has(name.script ?? '') &&
          STRICT_GENERAL_KINDS.has(name.kind),
      );
    case 'ja-reading':
      return names.filter(
        (name) =>
          languageOf(name.locale) === 'ja' &&
          name.kind === 'reading' &&
          JAPANESE_READING_SCRIPTS.has(name.script ?? ''),
      );
    case 'romanized':
      if (selected.kind === 'romanized') {
        return names.filter((name) => name.kind === 'romanized');
      }
      return names.filter(
        (name) =>
          languageOf(name.locale) === selectedLanguage &&
          name.script === 'Latn' &&
          STRICT_GENERAL_KINDS.has(name.kind),
      );
  }
}

function acceptedNames(
  names: readonly PlaceName[],
  selected: PlaceName,
  settings: LanguageSettings,
  includeHistoricInCasual: boolean,
): string[] {
  const candidates = settings.answerPolicy === 'strict'
    ? strictNames(names, selected, settings.typingLanguage)
    : names.filter(
        (name) => CASUAL_KINDS.has(name.kind) || (includeHistoricInCasual && name.kind === 'historic'),
      );

  const values = [selected.value, ...candidates.map((name) => name.value)];
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeCommon(value);
    if (key.length === 0 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Selects the target solely from `feature.names`. Legacy name fields must be
 * migrated explicitly before this function is called.
 */
export function resolveAnswer(
  feature: LanguageNamedFeature,
  settings: LanguageSettings,
  options: ResolveAnswerOptions = {},
): ResolvedAnswer | null {
  const selection = selectTarget(
    feature,
    settings,
    options.countryLanguageProfiles ?? COUNTRY_LANGUAGE_PROFILES,
  );
  if (!selection) return null;

  const resolved: ResolvedAnswer = {
    target: selection.name.value,
    acceptedAnswers: acceptedNames(
      feature.names ?? [],
      selection.name,
      settings,
      options.includeHistoricInCasual === true,
    ),
    typingLanguage: settings.typingLanguage,
    locale: selection.name.locale,
    fallbackUsed: selection.fallbackUsed,
  };
  if (selection.name.script !== undefined) resolved.script = selection.name.script;
  if (selection.fallbackReason !== undefined) resolved.fallbackReason = selection.fallbackReason;
  return resolved;
}

export function isResolvedAnswerAccepted(
  input: string,
  resolved: ResolvedAnswer,
  options: AnswerNormalizationOptions = {},
): boolean {
  const normalizedInput = normalizeForAnswerMode(input, resolved.typingLanguage, options);
  if (normalizedInput.length === 0) return false;
  return resolved.acceptedAnswers.some(
    (answer) =>
      normalizeForAnswerMode(answer, resolved.typingLanguage, options) === normalizedInput,
  );
}
