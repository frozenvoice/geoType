import { describe, expect, it } from 'vitest';

import { createMapResourceLoadError } from '../map/resourceErrors';

describe('map resource errors', () => {
  it('keeps resource kind and HTTP status while redacting API credentials', () => {
    const url = 'https://maps.example/style.json?key=secret';
    const error = createMapResourceLoadError(
      { error: { message: 'Forbidden', status: 403, url } },
      new Map([[url, 'Style']]),
      url,
    );

    expect(error.resourceType).toBe('지도 스타일');
    expect(error.statusCode).toBe(403);
    expect(error.resourceUrl).toContain('key=REDACTED');
    expect(error.resourceUrl).not.toContain('secret');
  });

  it('reports network failures without inventing an HTTP status', () => {
    const error = createMapResourceLoadError(
      { error: { message: 'Failed to fetch' } },
      new Map(),
      'https://tiles.example/style.json',
    );

    expect(error.resourceType).toBe('지도 리소스');
    expect(error.statusCode).toBeNull();
  });
});
