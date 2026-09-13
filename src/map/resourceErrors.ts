export class MapResourceLoadError extends Error {
  readonly resourceType: string;
  readonly statusCode: number | null;
  readonly resourceUrl: string | null;

  constructor(options: {
    message: string;
    resourceType: string;
    statusCode?: number | null;
    resourceUrl?: string | null;
    cause?: unknown;
  }) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MapResourceLoadError';
    this.resourceType = options.resourceType;
    this.statusCode = options.statusCode ?? null;
    this.resourceUrl = options.resourceUrl ?? null;
  }
}

type ErrorLike = {
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
  url?: unknown;
};

function statusFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d{3}$/.test(value)) return Number(value);
  return null;
}

function redactResourceUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, globalThis.location?.href ?? 'https://geotype.invalid/');
    for (const key of [...url.searchParams.keys()]) {
      if (/key|token|secret|signature|credential/i.test(key)) url.searchParams.set(key, 'REDACTED');
    }
    if (/^https?:/i.test(value)) return url.toString();
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

const RESOURCE_LABELS: Record<string, string> = {
  Style: '지도 스타일',
  Source: '지도 소스',
  Tile: '지도 타일',
  Glyphs: '지도 글리프',
  SpriteJSON: '지도 스프라이트 JSON',
  SpriteImage: '지도 스프라이트 이미지',
  Image: '지도 이미지',
  Unknown: '지도 리소스',
};

export function createMapResourceLoadError(
  event: unknown,
  requestedResourceTypes: ReadonlyMap<string, string>,
  styleUrl: string,
): MapResourceLoadError {
  const eventLike = (event && typeof event === 'object' ? event : {}) as ErrorLike & {
    error?: unknown;
  };
  const rawError = (
    eventLike.error && typeof eventLike.error === 'object' ? eventLike.error : eventLike
  ) as ErrorLike;
  const rawUrl = typeof rawError.url === 'string'
    ? rawError.url
    : typeof eventLike.url === 'string'
      ? eventLike.url
      : null;
  const requestedType = rawUrl ? requestedResourceTypes.get(rawUrl) : undefined;
  const sameAsStyle = rawUrl === styleUrl;
  const resourceType = RESOURCE_LABELS[requestedType ?? (sameAsStyle ? 'Style' : 'Unknown')]
    ?? requestedType
    ?? '지도 리소스';
  const statusCode = statusFrom(rawError.status)
    ?? statusFrom(rawError.statusCode)
    ?? statusFrom(eventLike.status)
    ?? statusFrom(eventLike.statusCode);
  const rawMessage = typeof rawError.message === 'string'
    ? rawError.message
    : typeof eventLike.message === 'string'
      ? eventLike.message
      : '지도 리소스를 불러오지 못했습니다.';

  return new MapResourceLoadError({
    message: rawMessage,
    resourceType,
    statusCode,
    resourceUrl: redactResourceUrl(rawUrl ?? styleUrl),
    cause: eventLike.error,
  });
}
