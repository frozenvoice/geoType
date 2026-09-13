import type { CountryLanguageProfile } from './types';

/**
 * Deliberately limited to verified profiles. Native mode is unavailable for a
 * country missing from this registry rather than guessing from its map labels.
 */
export const COUNTRY_LANGUAGE_PROFILES: Readonly<Record<string, CountryLanguageProfile>> = {
  DE: { countryCode: 'DE', preferredLocales: ['de'], defaultNativeLocale: 'de' },
  EG: { countryCode: 'EG', preferredLocales: ['ar'], defaultNativeLocale: 'ar' },
  FR: { countryCode: 'FR', preferredLocales: ['fr'], defaultNativeLocale: 'fr' },
  JP: { countryCode: 'JP', preferredLocales: ['ja'], defaultNativeLocale: 'ja' },
  KR: { countryCode: 'KR', preferredLocales: ['ko'], defaultNativeLocale: 'ko' },
  RU: { countryCode: 'RU', preferredLocales: ['ru'], defaultNativeLocale: 'ru' },
  US: { countryCode: 'US', preferredLocales: ['en'], defaultNativeLocale: 'en' },
};

export function getCountryLanguageProfile(
  countryCode: string | undefined,
  profiles: Readonly<Record<string, CountryLanguageProfile>> = COUNTRY_LANGUAGE_PROFILES,
): CountryLanguageProfile | null {
  if (!countryCode) return null;
  return profiles[countryCode.toUpperCase()] ?? null;
}

export function getOrderedNativeLocales(profile: CountryLanguageProfile): string[] {
  return [
    profile.defaultNativeLocale,
    ...profile.preferredLocales.filter(
      (locale) => locale.toLowerCase() !== profile.defaultNativeLocale.toLowerCase(),
    ),
  ];
}

export function findCountryCodesMissingLanguageProfiles(
  countryCodes: Iterable<string>,
  profiles: Readonly<Record<string, CountryLanguageProfile>> = COUNTRY_LANGUAGE_PROFILES,
): string[] {
  return [...new Set([...countryCodes].map((code) => code.toUpperCase()))]
    .filter((code) => getCountryLanguageProfile(code, profiles) === null)
    .sort();
}

