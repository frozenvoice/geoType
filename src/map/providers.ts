import type { MapProvider } from './types';

export type MapProviderId = 'hosted' | 'pmtiles' | 'test';

export type MapEnvironment = {
  VITE_MAP_PROVIDER?: string;
  VITE_MAP_STYLE_URL?: string;
  VITE_MAP_ACCESS_TOKEN?: string;
  VITE_MAP_TOKEN_PARAMETER?: string;
  VITE_MAP_ATTRIBUTION?: string;
  VITE_PM_TILES_URL?: string;
  VITE_MAP_TERRAIN_ENABLED?: string;
};

export const DEFAULT_MAP_PROVIDER: MapProviderId = 'hosted';
export const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type MapProviderResolution =
  | {
      ok: true;
      provider: MapProvider;
      visualQualityEligible: boolean;
    }
  | {
      ok: false;
      providerId: MapProviderId;
      title: string;
      message: string;
      missingVariables: string[];
      developmentHint: string;
      visualQualityEligible: false;
    };

type HostedMapProviderOptions = {
  styleUrl: string;
  accessToken?: string;
  tokenParameter?: string;
  attribution?: string;
  supportsTerrain?: boolean;
  supportsBuildings?: boolean;
};

const SERVER_URL_BASE = 'https://geotype.invalid/';

function getRuntimeUrlBase(): string {
  const runtime = globalThis as typeof globalThis & { location?: { href?: string } };
  return runtime.location?.href ?? SERVER_URL_BASE;
}

function getHttpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url, getRuntimeUrlBase());
    return /^https?:$/i.test(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

function serializeLikeInput(input: string, parsed: URL): string {
  if (/^https?:\/\//i.test(input)) return parsed.toString();
  if (input.startsWith('//')) return `//${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;

  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return input.startsWith('/') ? path : path.replace(/^\//, '');
}

function appendTokenForOrigin(
  url: string,
  token: string,
  parameter: string,
  trustedOrigin: string | null,
): string {
  if (!token || !parameter || !trustedOrigin || /^(?:data|blob|pmtiles):/i.test(url)) return url;

  try {
    const parsed = new URL(url, `${trustedOrigin}/`);
    if (!/^https?:$/i.test(parsed.protocol) || parsed.origin !== trustedOrigin) return url;
    if (!parsed.searchParams.has(parameter)) parsed.searchParams.set(parameter, token);
    return serializeLikeInput(url, parsed);
  } catch {
    return url;
  }
}

export class HostedMapProvider implements MapProvider {
  readonly id = 'hosted';
  readonly attribution: string;
  readonly supportsTerrain: boolean;
  readonly supportsBuildings: boolean;
  private readonly styleUrl: string;
  private readonly accessToken: string;
  private readonly tokenParameter: string;
  private readonly tokenOrigin: string | null;

  constructor(options: HostedMapProviderOptions) {
    this.styleUrl = options.styleUrl.trim();
    this.accessToken = options.accessToken?.trim() ?? '';
    this.tokenParameter = options.tokenParameter?.trim() || 'access_token';
    this.tokenOrigin = getHttpOrigin(this.styleUrl);
    this.attribution = options.attribution ?? '';
    this.supportsTerrain = options.supportsTerrain ?? false;
    this.supportsBuildings = options.supportsBuildings ?? true;
  }

  getStyleUrl(): string {
    return appendTokenForOrigin(
      this.styleUrl,
      this.accessToken,
      this.tokenParameter,
      this.tokenOrigin,
    );
  }

  transformRequest(url: string, resourceType: string) {
    void resourceType;
    return {
      url: appendTokenForOrigin(url, this.accessToken, this.tokenParameter, this.tokenOrigin),
    };
  }
}

type PMTilesMapProviderOptions = {
  styleUrl: string;
  archiveUrl: string;
  attribution: string;
  supportsTerrain?: boolean;
  supportsBuildings?: boolean;
};

export class PMTilesMapProvider implements MapProvider {
  readonly id = 'pmtiles';
  readonly attribution: string;
  readonly supportsTerrain: boolean;
  readonly supportsBuildings: boolean;
  readonly archiveUrl: string;
  private readonly styleUrl: string;

  constructor(options: PMTilesMapProviderOptions) {
    this.styleUrl = options.styleUrl.trim();
    this.archiveUrl = options.archiveUrl.trim();
    this.attribution = options.attribution.trim();
    if (!this.attribution) {
      throw new Error('PMTiles attribution must be configured for the selected archive.');
    }
    this.supportsTerrain = options.supportsTerrain ?? false;
    this.supportsBuildings = options.supportsBuildings ?? true;
  }

  getStyleUrl(): string {
    return this.styleUrl;
  }

  getArchiveSourceUrl(): string {
    return `pmtiles://${this.archiveUrl}`;
  }

  transformRequest(url: string, resourceType: string) {
    void resourceType;
    if (url.startsWith('pmtiles://geotype')) {
      return { url: url.replace('pmtiles://geotype', this.getArchiveSourceUrl()) };
    }
    return { url };
  }
}

type TestMapProviderOptions = {
  styleUrl?: string;
};

const TEST_STYLE = {
  version: 8,
  name: 'GeoType test renderer — not production map data',
  sources: {},
  layers: [
    {
      id: 'test-background',
      type: 'background',
      paint: { 'background-color': '#07101d' },
    },
  ],
};

export class TestMapProvider implements MapProvider {
  readonly id = 'test';
  readonly attribution = 'Test renderer only — geographic completeness is not claimed';
  readonly supportsTerrain = false;
  readonly supportsBuildings = false;
  private readonly styleUrl: string;

  constructor(options: TestMapProviderOptions = {}) {
    this.styleUrl =
      options.styleUrl ?? `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(TEST_STYLE))}`;
  }

  getStyleUrl(): string {
    return this.styleUrl;
  }
}

function normalizeProviderId(raw: string | undefined): MapProviderId {
  if (raw === 'pmtiles' || raw === 'test') return raw;
  return DEFAULT_MAP_PROVIDER;
}

function missingProviderResolution(
  providerId: MapProviderId,
  missingVariables: string[],
): MapProviderResolution {
  return {
    ok: false,
    providerId,
    title: '지도 공급자 설정이 필요합니다',
    message:
      '실제 벡터 지도 스타일을 불러올 수 없어 GeoType 지도를 시작하지 않았습니다. 테스트 지도를 완성품으로 대체 표시하지 않습니다.',
    missingVariables,
    developmentHint:
      providerId === 'pmtiles'
        ? 'VITE_MAP_PROVIDER=pmtiles와 함께 스타일 URL, PMTiles 아카이브 URL, 정확한 attribution 문구를 설정하세요. 개발 테스트는 VITE_MAP_PROVIDER=test로 실행할 수 있습니다.'
        : 'VITE_MAP_STYLE_URL을 설정하세요. 개발 테스트는 VITE_MAP_PROVIDER=test로 실행할 수 있습니다.',
    visualQualityEligible: false,
  };
}

export function resolveMapProvider(environment: MapEnvironment): MapProviderResolution {
  const providerId = normalizeProviderId(environment.VITE_MAP_PROVIDER?.trim().toLowerCase());

  if (providerId === 'test') {
    return {
      ok: true,
      provider: new TestMapProvider({
        ...(environment.VITE_MAP_STYLE_URL?.trim()
          ? { styleUrl: environment.VITE_MAP_STYLE_URL.trim() }
          : {}),
      }),
      visualQualityEligible: false,
    };
  }

  const configuredStyleUrl = environment.VITE_MAP_STYLE_URL?.trim() ?? '';
  const styleUrl = providerId === 'hosted'
    ? configuredStyleUrl || DEFAULT_MAP_STYLE_URL
    : configuredStyleUrl;
  if (providerId === 'hosted') {
    return {
      ok: true,
      provider: new HostedMapProvider({
        styleUrl,
        ...(environment.VITE_MAP_ACCESS_TOKEN?.trim()
          ? { accessToken: environment.VITE_MAP_ACCESS_TOKEN.trim() }
          : {}),
        ...(environment.VITE_MAP_TOKEN_PARAMETER?.trim()
          ? { tokenParameter: environment.VITE_MAP_TOKEN_PARAMETER.trim() }
          : {}),
        attribution: environment.VITE_MAP_ATTRIBUTION?.trim() ?? '',
        supportsTerrain: environment.VITE_MAP_TERRAIN_ENABLED?.trim().toLowerCase() === 'true',
        supportsBuildings: true,
      }),
      visualQualityEligible: true,
    };
  }

  const archiveUrl = environment.VITE_PM_TILES_URL?.trim() ?? '';
  const attribution = environment.VITE_MAP_ATTRIBUTION?.trim() ?? '';
  const missingVariables = [
    ...(!styleUrl ? ['VITE_MAP_STYLE_URL'] : []),
    ...(!archiveUrl ? ['VITE_PM_TILES_URL'] : []),
    ...(!attribution ? ['VITE_MAP_ATTRIBUTION'] : []),
  ];
  if (missingVariables.length > 0) return missingProviderResolution('pmtiles', missingVariables);

  return {
    ok: true,
    provider: new PMTilesMapProvider({ styleUrl, archiveUrl, attribution }),
    visualQualityEligible: true,
  };
}

export function resolveMapProviderFromViteEnvironment(): MapProviderResolution {
  const meta = import.meta as ImportMeta & { readonly env: MapEnvironment };
  return resolveMapProvider(meta.env);
}
