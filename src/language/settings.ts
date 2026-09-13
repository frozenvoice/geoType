import { z } from 'zod';

import { LanguageSettingsSchema } from './schemas';
import type { LanguageSettings } from './types';

export const LANGUAGE_DATA_VERSION = 'place-names-v1';
export const LANGUAGE_SETTINGS_VERSION = 1 as const;
export const LANGUAGE_SETTINGS_STORAGE_KEY = 'geotype.language-settings.v1';

export const DEFAULT_LANGUAGE_SETTINGS: Readonly<LanguageSettings> = {
  uiLocale: 'ko',
  typingLanguage: 'ko',
  answerPolicy: 'strict',
};

type LanguageSettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const StoredLanguageSettingsSchema = z.object({
  version: z.literal(LANGUAGE_SETTINGS_VERSION),
  settings: LanguageSettingsSchema,
});

function defaults(): LanguageSettings {
  return { ...DEFAULT_LANGUAGE_SETTINGS };
}

export function loadLanguageSettings(storage: Pick<LanguageSettingsStorage, 'getItem'>): LanguageSettings {
  try {
    const raw = storage.getItem(LANGUAGE_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults();
    const parsed: unknown = JSON.parse(raw);
    const stored = StoredLanguageSettingsSchema.safeParse(parsed);
    return stored.success ? { ...stored.data.settings } : defaults();
  } catch {
    return defaults();
  }
}

export function saveLanguageSettings(
  storage: Pick<LanguageSettingsStorage, 'setItem'>,
  settings: LanguageSettings,
): boolean {
  const parsed = LanguageSettingsSchema.safeParse(settings);
  if (!parsed.success) return false;
  try {
    storage.setItem(
      LANGUAGE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: LANGUAGE_SETTINGS_VERSION, settings: parsed.data }),
    );
    return true;
  } catch {
    return false;
  }
}

export function clearLanguageSettings(
  storage: Pick<LanguageSettingsStorage, 'removeItem'>,
): void {
  try {
    storage.removeItem(LANGUAGE_SETTINGS_STORAGE_KEY);
  } catch {
    // Language preferences are non-critical and storage may be unavailable.
  }
}

export function loadBrowserLanguageSettings(): LanguageSettings {
  if (typeof window === 'undefined') return defaults();
  try { return loadLanguageSettings(window.localStorage); }
  catch { return defaults(); }
}

export function saveBrowserLanguageSettings(settings: LanguageSettings): boolean {
  if (typeof window === 'undefined') return false;
  try { return saveLanguageSettings(window.localStorage, settings); }
  catch { return false; }
}
