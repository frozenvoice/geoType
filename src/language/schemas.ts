import { z } from 'zod';

import { normalizeCommon } from './normalizers';
import {
  ANSWER_POLICIES,
  NAME_KINDS,
  TYPING_LANGUAGES,
  UI_LOCALES,
  type PlaceName,
  type PlaceNameDataWarning,
} from './types';

const ISO_15924_PATTERN = /^[A-Z][a-z]{3}$/u;
const LATIN_SCRIPT_PATTERN = /\p{Script=Latin}/u;

function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1;
  } catch {
    return false;
  }
}

const normalizedNameValue = z.string().min(1).superRefine((value, context) => {
  if (value.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Place name values must contain visible text.',
    });
  }
  if (value !== value.normalize('NFC')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Place name values must be Unicode NFC normalized.',
    });
  }
});

export const PlaceNameSchema = z.object({
  locale: z.string().min(1).refine(isValidLocale, 'locale must be a valid BCP 47 language tag.'),
  script: z.string().regex(ISO_15924_PATTERN, 'script must use ISO 15924 form.').optional(),
  value: normalizedNameValue,
  kind: z.enum(NAME_KINDS),
  isPreferred: z.boolean(),
});

export const PlaceNamesSchema = z
  .array(PlaceNameSchema)
  .min(1)
  .superRefine((names, context) => {
    const seen = new Map<string, number>();
    names.forEach((name, index) => {
      const key = [
        name.locale.toLowerCase(),
        name.script ?? '',
        normalizeCommon(name.value),
        name.kind,
        String(name.isPreferred),
      ].join('\u0000');
      const previousIndex = seen.get(key);
      if (previousIndex !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: `Duplicate PlaceName also appears at index ${previousIndex}.`,
        });
      } else {
        seen.set(key, index);
      }
    });
  });

export const LanguageSettingsSchema = z.object({
  uiLocale: z.enum(UI_LOCALES),
  typingLanguage: z.enum(TYPING_LANGUAGES),
  answerPolicy: z.enum(ANSWER_POLICIES),
});

export const CountryLanguageProfileSchema = z
  .object({
    countryCode: z.string().regex(/^[A-Z]{2}$/u),
    preferredLocales: z.array(z.string().min(1).refine(isValidLocale)).min(1),
    defaultNativeLocale: z.string().min(1).refine(isValidLocale),
  })
  .superRefine((profile, context) => {
    const preferred = new Set(
      profile.preferredLocales.map((locale) => Intl.getCanonicalLocales(locale)[0]),
    );
    const defaultLocale = Intl.getCanonicalLocales(profile.defaultNativeLocale)[0];
    if (!preferred.has(defaultLocale)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['defaultNativeLocale'],
        message: 'defaultNativeLocale must be included in preferredLocales.',
      });
    }
  });

/**
 * Returns quality warnings that should be reported by data tooling but do not
 * make an otherwise structurally valid shard unreadable at runtime.
 */
export function inspectPlaceNameWarnings(
  names: readonly PlaceName[],
): PlaceNameDataWarning[] {
  const warnings: PlaceNameDataWarning[] = [];

  names.forEach((name, index) => {
    if (name.kind === 'reading' && name.script === 'Hani') {
      warnings.push({
        code: 'reading-hani-script',
        message: 'A reading should not be marked as Han script.',
        indexes: [index],
      });
    }
    if (name.kind === 'romanized' && !LATIN_SCRIPT_PATTERN.test(name.value)) {
      warnings.push({
        code: 'romanized-without-latin',
        message: 'A romanized name should contain at least one Latin-script character.',
        indexes: [index],
      });
    }
  });

  const preferredGroups = new Map<string, number[]>();
  names.forEach((name, index) => {
    if (!name.isPreferred) return;
    const key = `${name.locale.toLowerCase()}\u0000${name.kind}`;
    preferredGroups.set(key, [...(preferredGroups.get(key) ?? []), index]);
  });
  for (const indexes of preferredGroups.values()) {
    if (indexes.length > 1) {
      warnings.push({
        code: 'multiple-preferred-names',
        message: 'A locale and name kind should not have multiple preferred names.',
        indexes,
      });
    }
  }

  return warnings;
}

