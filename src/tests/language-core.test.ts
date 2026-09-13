import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LANGUAGE_SETTINGS,
  LANGUAGE_DATA_VERSION,
  LANGUAGE_SETTINGS_STORAGE_KEY,
  PlaceNameSchema,
  PlaceNamesSchema,
  clearLanguageSettings,
  findCountryCodesMissingLanguageProfiles,
  getLanguageEligibilityStats,
  getTypingLanguageAvailability,
  inferIso15924Script,
  inspectLegacyFeatureNameMigration,
  inspectPlaceNameWarnings,
  isResolvedAnswerAccepted,
  loadLanguageSettings,
  migrateLegacyFeatureNames,
  normalizeCommon,
  normalizeForAnswerMode,
  normalizeJapaneseReading,
  normalizeLatin,
  resolveAnswer,
  resolveEligibleFeatures,
  saveLanguageSettings,
  type LanguageNamedFeature,
  type LanguageSettings,
  type PlaceName,
  type TypingLanguage,
} from '../language';

const TOKYO_NAMES: PlaceName[] = [
  { locale: 'ko', script: 'Kore', value: '도쿄', kind: 'localized', isPreferred: true },
  { locale: 'ko', script: 'Kore', value: '동경', kind: 'historic', isPreferred: false },
  { locale: 'en', script: 'Latn', value: 'Tokyo', kind: 'localized', isPreferred: true },
  { locale: 'ja', script: 'Hani', value: '東京都', kind: 'official', isPreferred: true },
  { locale: 'ja', script: 'Hani', value: '東京', kind: 'short', isPreferred: false },
  { locale: 'ja', script: 'Hira', value: 'とうきょう', kind: 'reading', isPreferred: true },
  { locale: 'ja', script: 'Kana', value: 'トウキョウ', kind: 'reading', isPreferred: false },
  { locale: 'ja-Latn', script: 'Latn', value: 'Tōkyō', kind: 'romanized', isPreferred: true },
];

const OSAKA_NAMES: PlaceName[] = [
  { locale: 'ko', script: 'Kore', value: '오사카', kind: 'localized', isPreferred: true },
  { locale: 'en', script: 'Latn', value: 'Osaka', kind: 'localized', isPreferred: true },
  { locale: 'ja', script: 'Hani', value: '大阪市', kind: 'official', isPreferred: true },
  { locale: 'ja', script: 'Hani', value: '大阪', kind: 'short', isPreferred: false },
  { locale: 'ja', script: 'Hira', value: 'おおさか', kind: 'reading', isPreferred: true },
  { locale: 'ja-Latn', script: 'Latn', value: 'Ōsaka', kind: 'romanized', isPreferred: true },
];

const tokyo: LanguageNamedFeature = { countryCode: 'JP', names: TOKYO_NAMES };
const osaka: LanguageNamedFeature = { countryCode: 'JP', names: OSAKA_NAMES };

function settings(
  typingLanguage: TypingLanguage,
  answerPolicy: LanguageSettings['answerPolicy'] = 'strict',
): LanguageSettings {
  return { uiLocale: 'ko', typingLanguage, answerPolicy };
}

describe('PlaceName validation and migration', () => {
  it('accepts BCP 47 locales and ISO 15924 scripts', () => {
    expect(
      PlaceNameSchema.parse({
        locale: 'ja-Latn',
        script: 'Latn',
        value: 'Tōkyō',
        kind: 'romanized',
        isPreferred: true,
      }),
    ).toMatchObject({ locale: 'ja-Latn', script: 'Latn' });
  });

  it('rejects invalid locale/script values, blank names, non-NFC names, and duplicates', () => {
    expect(
      PlaceNameSchema.safeParse({
        locale: 'ja_JP',
        script: 'latin',
        value: ' ',
        kind: 'reading',
        isPreferred: true,
      }).success,
    ).toBe(false);
    expect(
      PlaceNameSchema.safeParse({
        locale: 'ko',
        script: 'Kore',
        value: '서울',
        kind: 'localized',
        isPreferred: true,
      }).success,
    ).toBe(false);
    expect(PlaceNamesSchema.safeParse([TOKYO_NAMES[0], TOKYO_NAMES[0]]).success).toBe(false);
  });

  it('reports non-fatal reading, romanization, and preferred-name quality warnings', () => {
    const warnings = inspectPlaceNameWarnings([
      { locale: 'ja', script: 'Hani', value: '東京', kind: 'reading', isPreferred: true },
      { locale: 'ja', script: 'Hani', value: '東京', kind: 'romanized', isPreferred: true },
      { locale: 'ja', script: 'Hira', value: 'とうきょう', kind: 'reading', isPreferred: true },
    ]);
    expect(warnings.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        'reading-hani-script',
        'romanized-without-latin',
        'multiple-preferred-names',
      ]),
    );
  });

  it('migrates only names whose legacy fields carry a locale', () => {
    const legacy = {
      name: 'Tokyo',
      localizedNames: { ko: '도쿄', en: 'Tokyo' },
      aliases: ['동경', '東京'],
    };
    const names = migrateLegacyFeatureNames(legacy);
    expect(names).toEqual([
      { locale: 'ko', script: 'Kore', value: '도쿄', kind: 'localized', isPreferred: true },
      { locale: 'en', script: 'Latn', value: 'Tokyo', kind: 'localized', isPreferred: true },
    ]);
    expect(inspectLegacyFeatureNameMigration(legacy).unresolved).toEqual([
      { field: 'aliases', value: '동경', reason: 'locale-unknown' },
      { field: 'aliases', value: '東京', reason: 'locale-unknown' },
    ]);
  });

  it('infers script from characters without inferring a locale or translation', () => {
    expect(inferIso15924Script('서울')).toBe('Kore');
    expect(inferIso15924Script('東京')).toBe('Hani');
    expect(inferIso15924Script('とうきょう')).toBe('Hira');
    expect(inferIso15924Script('Москва')).toBe('Cyrl');
    expect(inferIso15924Script('القاهرة')).toBe('Arab');
  });
});

describe('answer resolution', () => {
  it('selects Korean, English, Japanese kanji, Japanese reading, and romanized targets', () => {
    expect(resolveAnswer(tokyo, settings('ko'))).toMatchObject({
      target: '도쿄',
      locale: 'ko',
      script: 'Kore',
      fallbackUsed: false,
    });
    expect(resolveAnswer(tokyo, settings('en'))).toMatchObject({
      target: 'Tokyo',
      locale: 'en',
      fallbackUsed: false,
    });
    expect(resolveAnswer(tokyo, settings('ja-kanji'))).toMatchObject({
      target: '東京都',
      locale: 'ja',
      script: 'Hani',
    });
    expect(resolveAnswer(tokyo, settings('ja-reading'))).toMatchObject({
      target: 'とうきょう',
      script: 'Hira',
    });
    expect(resolveAnswer(tokyo, settings('romanized'))).toMatchObject({
      target: 'Tōkyō',
      locale: 'ja-Latn',
      script: 'Latn',
      fallbackUsed: false,
    });
  });

  it('selects a verified country native locale and does not guess a missing profile', () => {
    const munich: LanguageNamedFeature = {
      countryCode: 'DE',
      names: [
        { locale: 'de', script: 'Latn', value: 'München', kind: 'official', isPreferred: true },
        { locale: 'en', script: 'Latn', value: 'Munich', kind: 'localized', isPreferred: true },
        { locale: 'ko', script: 'Kore', value: '뮌헨', kind: 'localized', isPreferred: true },
      ],
    };
    expect(resolveAnswer(munich, settings('native'))).toMatchObject({
      target: 'München',
      locale: 'de',
      fallbackUsed: false,
    });
    expect(resolveAnswer({ ...munich, countryCode: 'ZZ' }, settings('native'))).toBeNull();
  });

  it('returns null rather than silently falling back from missing Korean data to English', () => {
    const englishOnly: LanguageNamedFeature = {
      countryCode: 'JP',
      names: [{ locale: 'en', script: 'Latn', value: 'Tokyo', kind: 'localized', isPreferred: true }],
    };
    expect(resolveAnswer(englishOnly, settings('ko'))).toBeNull();
  });

  it('does not treat an explicitly romanized Korean name as a Korean-mode target', () => {
    const romanizedKoreanOnly: LanguageNamedFeature = {
      countryCode: 'KR',
      names: [
        {
          locale: 'ko-Latn',
          script: 'Latn',
          value: 'Daehan Minguk',
          kind: 'romanized',
          isPreferred: true,
        },
      ],
    };
    expect(resolveAnswer(romanizedKoreanOnly, settings('ko'))).toBeNull();
    expect(resolveAnswer(romanizedKoreanOnly, settings('romanized'))?.target)
      .toBe('Daehan Minguk');
  });

  it('falls back through an explicitly ordered multilingual country profile', () => {
    const canadianFrench: LanguageNamedFeature = {
      countryCode: 'CA',
      names: [
        { locale: 'fr', script: 'Latn', value: 'Québec', kind: 'official', isPreferred: true },
      ],
    };
    expect(
      resolveAnswer(canadianFrench, settings('native'), {
        countryLanguageProfiles: {
          CA: {
            countryCode: 'CA',
            preferredLocales: ['en', 'fr'],
            defaultNativeLocale: 'en',
          },
        },
      }),
    ).toMatchObject({
      target: 'Québec',
      locale: 'fr',
      fallbackUsed: true,
      fallbackReason: 'native-used-secondary-preferred-locale:fr',
    });
  });

  it('uses only names, never legacy fields at runtime', () => {
    const legacyOnly = {
      countryCode: 'JP',
      localizedNames: { ko: '도쿄', en: 'Tokyo' },
      aliases: ['東京'],
    };
    expect(resolveAnswer(legacyOnly, settings('ko'))).toBeNull();
  });

  it('keeps strict answers in the selected mode and allows explicit suffix variants', () => {
    const strictTokyo = resolveAnswer(tokyo, settings('ko'));
    expect(strictTokyo?.acceptedAnswers).toEqual(['도쿄']);
    expect(strictTokyo && isResolvedAnswerAccepted('Tokyo', strictTokyo)).toBe(false);

    const seoul: LanguageNamedFeature = {
      countryCode: 'KR',
      names: [
        { locale: 'ko', script: 'Kore', value: '서울', kind: 'localized', isPreferred: true },
        { locale: 'ko', script: 'Kore', value: '서울특별시', kind: 'official', isPreferred: false },
      ],
    };
    expect(resolveAnswer(seoul, settings('ko'))?.acceptedAnswers).toEqual(['서울', '서울특별시']);
  });

  it('allows registered casual alternatives but excludes historic names by default', () => {
    const casual = resolveAnswer(tokyo, settings('ko', 'casual'));
    expect(casual?.acceptedAnswers).toEqual(
      expect.arrayContaining(['도쿄', 'Tokyo', '東京都', '東京', 'とうきょう', 'Tōkyō']),
    );
    expect(casual?.acceptedAnswers).not.toContain('동경');
    expect(casual && isResolvedAnswerAccepted('Tokyo', casual)).toBe(true);
  });

  it('accepts registered historic names only through an explicit resolver option', () => {
    expect(
      resolveAnswer(tokyo, settings('ko', 'casual'), { includeHistoricInCasual: true })
        ?.acceptedAnswers,
    ).toContain('동경');
  });

  it('marks documented cross-category target fallbacks', () => {
    const noEnglish: LanguageNamedFeature = {
      countryCode: 'JP',
      names: [
        { locale: 'ja-Latn', script: 'Latn', value: 'Tōkyō', kind: 'romanized', isPreferred: true },
      ],
    };
    expect(resolveAnswer(noEnglish, settings('en'))).toMatchObject({
      target: 'Tōkyō',
      fallbackUsed: true,
      fallbackReason: 'english-used-registered-romanized-name',
    });
  });
});

describe('answer normalization', () => {
  it('normalizes NFC, whitespace, zero-width characters, and Latin case', () => {
    expect(normalizeCommon('  SEO\u200BUL\u00a0  Station  ')).toBe('seoul station');
    expect(normalizeCommon('서울')).toBe('서울');
  });

  it('optionally ignores Latin diacritics in romanized mode without changing the target', () => {
    expect(normalizeLatin('Tōkyō', { removeDiacritics: true })).toBe('tokyo');
    const answer = resolveAnswer(tokyo, settings('romanized'));
    expect(answer?.target).toBe('Tōkyō');
    expect(answer && isResolvedAnswerAccepted('TOKYO', answer)).toBe(true);
    expect(answer && isResolvedAnswerAccepted('Tokyo', answer, { romanizedDiacriticInsensitive: false })).toBe(false);
  });

  it('optionally treats hiragana and katakana readings as equivalent', () => {
    expect(normalizeJapaneseReading('トウキョウ')).toBe('とうきょう');
    const answer = resolveAnswer(tokyo, settings('ja-reading'));
    expect(answer && isResolvedAnswerAccepted('トウキョウ', answer)).toBe(true);
    expect(answer && isResolvedAnswerAccepted('トウキョウ', answer, { japaneseKanaInsensitive: false })).toBe(true);

    const hiraOnly: LanguageNamedFeature = {
      countryCode: 'JP',
      names: [{ locale: 'ja', script: 'Hira', value: 'とうきょう', kind: 'reading', isPreferred: true }],
    };
    const hiraAnswer = resolveAnswer(hiraOnly, settings('ja-reading'));
    expect(hiraAnswer && isResolvedAnswerAccepted('トウキョウ', hiraAnswer, { japaneseKanaInsensitive: false })).toBe(false);
  });

  it('does not automatically equate simplified and traditional Chinese', () => {
    expect(normalizeForAnswerMode('汉语', 'native')).not.toBe(
      normalizeForAnswerMode('漢語', 'native'),
    );
  });
});

describe('language eligibility and scope options', () => {
  it('returns resolved feature-answer pairs and counts before question slicing', () => {
    const japaneseOnly: LanguageNamedFeature = {
      countryCode: 'JP',
      names: [{ locale: 'ja', script: 'Hani', value: '京都', kind: 'short', isPreferred: true }],
    };
    const result = resolveEligibleFeatures([tokyo, osaka, japaneseOnly], settings('ko'));
    expect(result).toMatchObject({
      typingLanguage: 'ko',
      total: 3,
      totalEligible: 2,
      excluded: 1,
    });
    expect(result.eligible.map(({ answer }) => answer.target)).toEqual(['도쿄', '오사카']);
    expect(getLanguageEligibilityStats([tokyo, osaka, japaneseOnly], settings('ja-reading')))
      .toMatchObject({ total: 3, totalEligible: 2, excluded: 1 });
  });

  it('disables native and Japan-specific modes for broad scopes', () => {
    const availability = getTypingLanguageAvailability('world', undefined, 'ko');
    expect(availability.filter(({ enabled }) => enabled).map(({ typingLanguage }) => typingLanguage))
      .toEqual(['ko', 'en', 'romanized']);
    expect(availability.find(({ typingLanguage }) => typingLanguage === 'native')?.reason)
      .toBe('여러 문자 체계가 섞여 한 게임 중 입력기를 반복 변경해야 합니다.');
  });

  it('exposes separate kanji and reading choices for Japan', () => {
    const enabled = getTypingLanguageAvailability('country', 'JP')
      .filter((option) => option.enabled)
      .map((option) => option.typingLanguage);
    expect(enabled).toEqual(['ko', 'en', 'romanized', 'ja-kanji', 'ja-reading']);
    expect(enabled).not.toContain('native');
  });

  it('reports country codes without a verified native-language profile', () => {
    expect(findCountryCodesMissingLanguageProfiles(['KR', 'JP', 'ZZ', 'zz'])).toEqual(['ZZ']);
  });
});

describe('versioned language settings persistence', () => {
  function storage() {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      values,
    };
  }

  it('defaults independently to Korean strict and exports a language data version', () => {
    const memory = storage();
    expect(loadLanguageSettings(memory)).toEqual(DEFAULT_LANGUAGE_SETTINGS);
    expect(LANGUAGE_DATA_VERSION).toBe('place-names-v1');
    expect(LANGUAGE_SETTINGS_STORAGE_KEY).toContain('language-settings');
  });

  it('round-trips valid versioned settings and recovers from corrupt data', () => {
    const memory = storage();
    const japanese = settings('ja-reading', 'casual');
    expect(saveLanguageSettings(memory, japanese)).toBe(true);
    expect(loadLanguageSettings(memory)).toEqual(japanese);

    memory.values.set(LANGUAGE_SETTINGS_STORAGE_KEY, '{corrupt');
    expect(loadLanguageSettings(memory)).toEqual(DEFAULT_LANGUAGE_SETTINGS);
    clearLanguageSettings(memory);
    expect(memory.values.has(LANGUAGE_SETTINGS_STORAGE_KEY)).toBe(false);
  });
});
