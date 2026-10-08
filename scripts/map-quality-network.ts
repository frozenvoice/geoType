export function isOpenFreeMapTileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://tiles.openfreemap.org' &&
      /^\/(?:natural_earth\/ne2sr|planet\/[^/]+)\/\d+\/\d+\/\d+\.(?:png|pbf|mvt)$/.test(url.pathname);
  } catch {
    return false;
  }
}

// Chromium reports MapLibre's cancellation of superseded/offscreen tiles as
// requestfailed. Keep that evidence, but distinguish it from transport errors.
// Style, TileJSON, glyph, sprite, other origins and other errors remain failures.
// This never replaces the real tile response, readiness and geometry assertions.
export function isExpectedMapTileCancellation(url: string, error: string | undefined): boolean {
  return error === 'net::ERR_ABORTED' && isOpenFreeMapTileUrl(url);
}
