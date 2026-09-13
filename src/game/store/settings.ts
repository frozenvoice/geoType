export type PersistedSettings = {
  muted: boolean;
  reducedMotion: boolean;
};

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

type StoredSettingsV2 = PersistedSettings & {
  soundVersion: 2;
};

export const SETTINGS_STORAGE_KEY = 'geotype.settings.v2';
export const LEGACY_SETTINGS_STORAGE_KEY = 'geotype.settings.v1';

function defaultSettings(prefersReducedMotion: boolean): PersistedSettings {
  return {
    muted: true,
    reducedMotion: prefersReducedMotion,
  };
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeV2(storage: SettingsStorage, settings: PersistedSettings): void {
  const value: StoredSettingsV2 = { ...settings, soundVersion: 2 };
  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(value));
}

export function loadSettings(
  storage: SettingsStorage,
  prefersReducedMotion = false,
): PersistedSettings {
  const defaults = defaultSettings(prefersReducedMotion);

  try {
    const currentRaw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (currentRaw) {
      const current = parseObject(currentRaw);
      if (current?.soundVersion === 2) {
        return {
          muted: typeof current.muted === 'boolean' ? current.muted : true,
          reducedMotion: typeof current.reducedMotion === 'boolean'
            ? current.reducedMotion
            : defaults.reducedMotion,
        };
      }
    }

    const legacyRaw = storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!legacyRaw) return defaults;

    const legacy = parseObject(legacyRaw);
    const migrated = {
      // Sound v1 could default to ON. Every v1 value is deliberately reset to
      // OFF once so the removed synthesized sounds cannot surprise users.
      muted: true,
      reducedMotion: typeof legacy?.reducedMotion === 'boolean'
        ? legacy.reducedMotion
        : defaults.reducedMotion,
    } satisfies PersistedSettings;

    writeV2(storage, migrated);
    return migrated;
  } catch {
    return defaults;
  }
}

export function saveSettings(storage: SettingsStorage, settings: PersistedSettings): void {
  try {
    writeV2(storage, settings);
  } catch {
    // Preferences are non-critical and may be blocked in private browsing.
  }
}

export function loadBrowserSettings(): PersistedSettings {
  if (typeof window === 'undefined') return defaultSettings(false);

  const prefersReducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    return loadSettings(window.localStorage, prefersReducedMotion);
  } catch {
    return defaultSettings(prefersReducedMotion);
  }
}

export function saveBrowserSettings(settings: PersistedSettings): void {
  if (typeof window === 'undefined') return;
  try {
    saveSettings(window.localStorage, settings);
  } catch {
    // A denied storage getter must not prevent playing or changing a setting.
  }
}
