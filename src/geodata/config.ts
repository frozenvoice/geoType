export const DEFAULT_GEO_CATALOG_BASE_URL = '/geodata';
export const DEFAULT_WORLD_COUNTRY_BASE_URL = `${DEFAULT_GEO_CATALOG_BASE_URL}/world`;

export type GeoCatalogMode = 'production' | 'fixture';

export type GeoCatalogModeOptions = {
  searchParams?: URLSearchParams;
  fixtureEnvironmentValue?: string | null;
  isDevelopment?: boolean;
  isTest?: boolean;
};

/** The small manifest catalog is deliberately opt-in and never a fallback. */
export function resolveGeoCatalogMode({
  searchParams = new URLSearchParams(),
  fixtureEnvironmentValue,
  isDevelopment = false,
  isTest = false,
}: GeoCatalogModeOptions = {}): GeoCatalogMode {
  if (searchParams.get('fixture') === '1') return 'fixture';
  if (isTest) return 'fixture';
  if (isDevelopment && fixtureEnvironmentValue?.trim().toLowerCase() === 'true') {
    return 'fixture';
  }
  return 'production';
}

export function resolveWorldCountryBaseUrl(value?: string | null): string {
  const root = resolveGeoCatalogBaseUrl(value);
  return /\/world(?:[?#]|$)/i.test(root) ? root : `${root}/world`;
}

function splitUrlSuffix(value: string): { path: string; suffix: string } {
  const suffixIndex = value.search(/[?#]/);
  if (suffixIndex < 0) return { path: value, suffix: '' };
  return {
    path: value.slice(0, suffixIndex),
    suffix: value.slice(suffixIndex),
  };
}

/**
 * Resolves the catalog root without forcing same-origin paths to become absolute.
 * Keeping `/geodata` relative to the current origin makes the default work in
 * Vite development, previews, and production deployments alike.
 */
export function resolveGeoCatalogBaseUrl(value?: string | null): string {
  const candidate = value?.trim() || DEFAULT_GEO_CATALOG_BASE_URL;
  const { path, suffix } = splitUrlSuffix(candidate);
  const normalizedPath = path === '/' ? path : path.replace(/\/+$/, '');
  return `${normalizedPath}${suffix}`;
}

export function resolveGeoCatalogManifestUrl(baseUrl?: string | null): string {
  const resolvedBaseUrl = resolveGeoCatalogBaseUrl(baseUrl);
  const { path, suffix } = splitUrlSuffix(resolvedBaseUrl);
  if (/\/manifest\.json$/i.test(path)) return resolvedBaseUrl;
  const separator = path.endsWith('/') ? '' : '/';
  return `${path}${separator}manifest.json${suffix}`;
}

export const DEFAULT_GEO_CATALOG_MANIFEST_URL = resolveGeoCatalogManifestUrl();
