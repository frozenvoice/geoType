import type * as maplibregl from 'maplibre-gl';
import { PMTiles, Protocol } from 'pmtiles';

type MapLibreProtocolHost = Pick<typeof maplibregl, 'addProtocol'>;

let sharedProtocol: Protocol | null = null;
let protocolRegistered = false;
const registeredArchives = new Set<string>();

/**
 * Registers the PMTiles protocol once per browser runtime and adds the selected
 * archive to its cache. The protocol deliberately remains registered between
 * map mounts because MapLibre's protocol registry is global.
 */
export function registerPMTilesProtocol(
  maplibre: MapLibreProtocolHost,
  archiveUrl: string,
): PMTiles {
  const normalizedUrl = archiveUrl.trim();
  if (!normalizedUrl) throw new Error('PMTiles archive URL is required.');

  sharedProtocol ??= new Protocol();
  if (!protocolRegistered) {
    maplibre.addProtocol('pmtiles', sharedProtocol.tile);
    protocolRegistered = true;
  }

  const archive = new PMTiles(normalizedUrl);
  if (!registeredArchives.has(normalizedUrl)) {
    sharedProtocol.add(archive);
    registeredArchives.add(normalizedUrl);
  }
  return archive;
}
