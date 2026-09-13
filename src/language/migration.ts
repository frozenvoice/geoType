import { normalizePlaceNameValue } from './normalizers';
import type { PlaceName } from './types';

const HANGUL_PATTERN = /\p{Script=Hangul}/u;
const HAN_PATTERN = /\p{Script=Han}/u;
const HIRAGANA_PATTERN = /\p{Script=Hiragana}/u;
const KATAKANA_PATTERN = /\p{Script=Katakana}/u;
const LATIN_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_PATTERN = /\p{Script=Cyrillic}/u;
const ARABIC_PATTERN = /\p{Script=Arabic}/u;

export type LegacyFeatureNameData = {
  name?: string;
  nameKo?: string;
  nameEn?: string;
  localizedNames?: Readonly<Record<string, string>>;
  aliases?: readonly string[];
  names?: readonly PlaceName[];
};

export type UnresolvedLegacyName = {
  field: 'name' | 'aliases';
  value: string;
  reason: 'locale-unknown';
};

export type LegacyNameMigrationResult = {
  names: PlaceName[];
  unresolved: UnresolvedLegacyName[];
};

export function inferIso15924Script(value: string): string | undefined {
  const hasHan = HAN_PATTERN.test(value);
  const hasHiragana = HIRAGANA_PATTERN.test(value);
  const hasKatakana = KATAKANA_PATTERN.test(value);

  if (hasHan && (hasHiragana || hasKatakana)) return 'Jpan';
  if (HANGUL_PATTERN.test(value)) return 'Kore';
  if (hasHiragana) return 'Hira';
  if (hasKatakana) return 'Kana';
  if (hasHan) return 'Hani';
  if (LATIN_PATTERN.test(value)) return 'Latn';
  if (CYRILLIC_PATTERN.test(value)) return 'Cyrl';
  if (ARABIC_PATTERN.test(value)) return 'Arab';
  return undefined;
}

function canonicalizeLocale(locale: string): string {
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? locale;
  } catch {
    return locale;
  }
}

function placeNameKey(name: PlaceName): string {
  return [
    name.locale.toLowerCase(),
    name.script ?? '',
    name.value,
    name.kind,
    String(name.isPreferred),
  ].join('\u0000');
}

function migrateWithReport(feature: LegacyFeatureNameData): LegacyNameMigrationResult {
  const names: PlaceName[] = [];
  const keys = new Set<string>();
  const unresolved: UnresolvedLegacyName[] = [];

  const addName = (name: PlaceName): void => {
    const normalized: PlaceName = {
      ...name,
      locale: canonicalizeLocale(name.locale),
      value: normalizePlaceNameValue(name.value),
    };
    const key = placeNameKey(normalized);
    if (normalized.value.length > 0 && !keys.has(key)) {
      keys.add(key);
      names.push(normalized);
    }
  };

  for (const existingName of feature.names ?? []) addName(existingName);

  const localizedNames = new Map(Object.entries(feature.localizedNames ?? {}));
  if (feature.nameKo) localizedNames.set('ko', feature.nameKo);
  if (feature.nameEn) localizedNames.set('en', feature.nameEn);

  for (const [locale, value] of localizedNames) {
    const script = inferIso15924Script(value);
    addName({
      locale,
      ...(script === undefined ? {} : { script }),
      value,
      kind: 'localized',
      isPreferred: true,
    });
  }

  const representedValues = new Set(names.map((name) => normalizePlaceNameValue(name.value)));
  if (feature.name) {
    const value = normalizePlaceNameValue(feature.name);
    if (value.length > 0 && !representedValues.has(value)) {
      unresolved.push({ field: 'name', value, reason: 'locale-unknown' });
    }
  }

  for (const alias of feature.aliases ?? []) {
    const value = normalizePlaceNameValue(alias);
    if (value.length > 0 && !representedValues.has(value)) {
      unresolved.push({ field: 'aliases', value, reason: 'locale-unknown' });
    }
  }

  return { names, unresolved };
}

/** Explicit load-time migration. Runtime answer resolution never calls this. */
export function migrateLegacyFeatureNames(feature: LegacyFeatureNameData): PlaceName[] {
  return migrateWithReport(feature).names;
}

export function inspectLegacyFeatureNameMigration(
  feature: LegacyFeatureNameData,
): LegacyNameMigrationResult {
  return migrateWithReport(feature);
}

export function withMigratedFeatureNames<T extends LegacyFeatureNameData>(
  feature: T,
): T & { names: PlaceName[] } {
  return { ...feature, names: migrateLegacyFeatureNames(feature) };
}
