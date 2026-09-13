import { getCountryLanguageProfile, COUNTRY_LANGUAGE_PROFILES } from './profiles';
import { resolveAnswer, type ResolveAnswerOptions } from './resolver';
import type {
  CountryLanguageProfile,
  LanguageNamedFeature,
  LanguageScopeKind,
  LanguageSettings,
  ResolvedAnswer,
  TypingLanguage,
  TypingLanguageAvailability,
  UiLocale,
} from './types';

export type EligibleFeatureAnswer<T extends LanguageNamedFeature> = {
  feature: T;
  answer: ResolvedAnswer;
};

export type LanguageEligibilityResult<T extends LanguageNamedFeature> = {
  typingLanguage: TypingLanguage;
  total: number;
  totalEligible: number;
  excluded: number;
  eligible: EligibleFeatureAnswer<T>[];
};

export type LanguageEligibilityStats = Omit<LanguageEligibilityResult<LanguageNamedFeature>, 'eligible'>;

/** Resolve once, then slice/shuffle `eligible`; never slice candidates first. */
export function resolveEligibleFeatures<T extends LanguageNamedFeature>(
  features: readonly T[],
  settings: LanguageSettings,
  options: ResolveAnswerOptions = {},
): LanguageEligibilityResult<T> {
  const eligible: EligibleFeatureAnswer<T>[] = [];
  for (const feature of features) {
    const answer = resolveAnswer(feature, settings, options);
    if (answer) eligible.push({ feature, answer });
  }
  return {
    typingLanguage: settings.typingLanguage,
    total: features.length,
    totalEligible: eligible.length,
    excluded: features.length - eligible.length,
    eligible,
  };
}

export function getLanguageEligibilityStats<T extends LanguageNamedFeature>(
  features: readonly T[],
  settings: LanguageSettings,
  options: ResolveAnswerOptions = {},
): LanguageEligibilityStats {
  const result = resolveEligibleFeatures(features, settings, options);
  return {
    typingLanguage: result.typingLanguage,
    total: result.total,
    totalEligible: result.totalEligible,
    excluded: result.excluded,
  };
}

export function getEligibilityStatsByLanguage<T extends LanguageNamedFeature>(
  features: readonly T[],
  settings: Pick<LanguageSettings, 'uiLocale' | 'answerPolicy'>,
  typingLanguages: readonly TypingLanguage[],
  options: ResolveAnswerOptions = {},
): LanguageEligibilityStats[] {
  return typingLanguages.map((typingLanguage) =>
    getLanguageEligibilityStats(features, { ...settings, typingLanguage }, options),
  );
}

export const MIXED_SCRIPT_NATIVE_MODE_REASON: Readonly<Record<UiLocale, string>> = {
  ko: '여러 문자 체계가 섞여 한 게임 중 입력기를 반복 변경해야 합니다.',
  en: 'This would mix writing systems and require repeated input-method changes during one game.',
};

const JAPAN_ONLY_REASON: Readonly<Record<UiLocale, string>> = {
  ko: '일본 지역에서만 선택할 수 있습니다.',
  en: 'This option is available only for locations in Japan.',
};

const PROFILE_MISSING_REASON: Readonly<Record<UiLocale, string>> = {
  ko: '이 국가의 현지어 프로필이 등록되지 않았습니다.',
  en: 'No verified native-language profile is registered for this country.',
};

export function getTypingLanguageAvailability(
  scopeKind: LanguageScopeKind,
  countryCode: string | undefined,
  uiLocale: UiLocale = 'ko',
  profiles: Readonly<Record<string, CountryLanguageProfile>> = COUNTRY_LANGUAGE_PROFILES,
): TypingLanguageAvailability[] {
  const isBroadScope = scopeKind === 'world' || scopeKind === 'continent';
  const isJapan = countryCode?.toUpperCase() === 'JP';
  const hasNativeProfile = getCountryLanguageProfile(countryCode, profiles) !== null;

  return [
    { typingLanguage: 'ko', enabled: true },
    { typingLanguage: 'en', enabled: true },
    {
      typingLanguage: 'native',
      enabled: !isBroadScope && !isJapan && hasNativeProfile,
      ...(!isBroadScope && !isJapan && hasNativeProfile
        ? {}
        : {
            reason: isBroadScope
              ? MIXED_SCRIPT_NATIVE_MODE_REASON[uiLocale]
              : isJapan
                ? JAPAN_ONLY_REASON[uiLocale]
                : PROFILE_MISSING_REASON[uiLocale],
          }),
    },
    { typingLanguage: 'romanized', enabled: true },
    {
      typingLanguage: 'ja-kanji',
      enabled: !isBroadScope && isJapan,
      ...(!isBroadScope && isJapan ? {} : { reason: JAPAN_ONLY_REASON[uiLocale] }),
    },
    {
      typingLanguage: 'ja-reading',
      enabled: !isBroadScope && isJapan,
      ...(!isBroadScope && isJapan ? {} : { reason: JAPAN_ONLY_REASON[uiLocale] }),
    },
  ];
}
