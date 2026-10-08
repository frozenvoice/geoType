// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isExpectedMapTileCancellation, isOpenFreeMapTileUrl } from '../../scripts/map-quality-network';

describe('real-map resource evidence', () => {
  const tile = 'https://tiles.openfreemap.org/natural_earth/ne2sr/2/0/2.png';

  it('recognizes only actual free raster/vector z/x/y tile cancellations', () => {
    for (const url of [tile, 'https://tiles.openfreemap.org/planet/20261004_113936_pt/16/55887/25370.pbf']) {
      expect(isOpenFreeMapTileUrl(url)).toBe(true);
      expect(isExpectedMapTileCancellation(url, 'net::ERR_ABORTED')).toBe(true);
    }
  });

  it('retains genuine tile DNS, connectivity and timeout errors as failures', () => {
    for (const error of ['net::ERR_NAME_NOT_RESOLVED', 'net::ERR_CONNECTION_RESET', 'net::ERR_TIMED_OUT', undefined]) {
      expect(isExpectedMapTileCancellation(tile, error)).toBe(false);
    }
  });

  it('does not ignore cancellation of required metadata or fonts', () => {
    for (const path of ['/styles/liberty', '/planet', '/sprites/ofm_f384/ofm.png', '/fonts/Noto%20Sans/0-255.pbf']) {
      expect(isExpectedMapTileCancellation(`https://tiles.openfreemap.org${path}`, 'net::ERR_ABORTED')).toBe(false);
    }
  });

  it('does not classify other providers, deceptive origins or malformed URLs as expected cancellations', () => {
    for (const url of [
      tile.replace('https:', 'http:'), tile.replace('tiles.openfreemap.org', 'paid.example'),
      tile.replace('tiles.openfreemap.org', 'tiles.openfreemap.org.example'),
      tile.replace('tiles.openfreemap.org', 'tiles.openfreemap.org:8443'), 'not a URL',
    ]) expect(isExpectedMapTileCancellation(url, 'net::ERR_ABORTED')).toBe(false);
  });
});
