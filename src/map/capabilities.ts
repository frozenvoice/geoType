export type MapCapabilityEnvironment = {
  VITE_MAP_TERRAIN_ENABLED?: string;
  VITE_MAP_TERRAIN_SOURCE_ID?: string;
  VITE_MAP_TERRAIN_SOURCE_URL?: string;
  VITE_MAP_TERRAIN_TILES?: string;
  VITE_MAP_TERRAIN_TILE_SIZE?: string;
  VITE_MAP_TERRAIN_EXAGGERATION?: string;
  VITE_MAP_BUILDINGS_ENABLED?: string;
  VITE_MAP_BUILDINGS_SOURCE_ID?: string;
  VITE_MAP_BUILDINGS_SOURCE_LAYER?: string;
  VITE_MAP_BUILDINGS_LAYER_ID?: string;
  VITE_MAP_BUILDINGS_MIN_ZOOM?: string;
};

export type TerrainOptions = {
  enabled: true;
  sourceId: string;
  sourceUrl?: string;
  tiles?: string[];
  tileSize?: number;
  exaggeration?: number;
};

export type BuildingOptions = {
  enabled: true;
  sourceId: string;
  sourceLayer: string;
  layerId?: string;
  minZoom?: number;
};

export type CapabilityConfiguration<T> = {
  requested: boolean;
  configured: boolean;
  options: T | null;
  issues: string[];
};

export type MapCapabilityConfiguration = {
  terrain: CapabilityConfiguration<TerrainOptions>;
  buildings: CapabilityConfiguration<BuildingOptions>;
  issues: string[];
};

function readOptInBoolean(
  environment: MapCapabilityEnvironment,
  key: keyof MapCapabilityEnvironment,
  issues: string[],
) {
  const value = environment[key]?.trim().toLowerCase();
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  issues.push(`${key} must be either "true" or "false".`);
  return false;
}

function readRequiredString(
  environment: MapCapabilityEnvironment,
  key: keyof MapCapabilityEnvironment,
  issues: string[],
) {
  const value = environment[key]?.trim() ?? '';
  if (!value) issues.push(`${key} is required when the capability is enabled.`);
  return value;
}

function readNumber(
  raw: string | undefined,
  key: keyof MapCapabilityEnvironment,
  issues: string[],
  options: { min: number; max: number; integer?: boolean },
) {
  if (!raw?.trim()) return undefined;
  const value = Number(raw);
  if (
    !Number.isFinite(value) ||
    value < options.min ||
    value > options.max ||
    (options.integer === true && !Number.isInteger(value))
  ) {
    const integer = options.integer === true ? ' integer' : '';
    issues.push(`${key} must be an${integer} number between ${options.min} and ${options.max}.`);
    return undefined;
  }
  return value;
}

function readTiles(raw: string | undefined, issues: string[]) {
  if (!raw?.trim()) return undefined;
  const value = raw.trim();
  if (value.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        const entries = parsed as unknown[];
        const strings = entries.filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
        );
        if (strings.length === entries.length && strings.length > 0) {
          return strings.map((entry) => entry.trim());
        }
      }
    } catch {
      // The shared validation error below is more useful than the JSON parser message.
    }
    issues.push('VITE_MAP_TERRAIN_TILES must be a JSON string array or a comma-separated URL list.');
    return undefined;
  }

  const tiles = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (tiles.length === 0) {
    issues.push('VITE_MAP_TERRAIN_TILES must contain at least one URL when provided.');
    return undefined;
  }
  return tiles;
}

function resolveTerrain(environment: MapCapabilityEnvironment): CapabilityConfiguration<TerrainOptions> {
  const issues: string[] = [];
  const requested = readOptInBoolean(environment, 'VITE_MAP_TERRAIN_ENABLED', issues);
  if (!requested) return { requested, configured: false, options: null, issues };

  const sourceId = readRequiredString(environment, 'VITE_MAP_TERRAIN_SOURCE_ID', issues);
  const sourceUrl = environment.VITE_MAP_TERRAIN_SOURCE_URL?.trim() || undefined;
  const tiles = readTiles(environment.VITE_MAP_TERRAIN_TILES, issues);
  if (sourceUrl && tiles) {
    issues.push('Configure only one of VITE_MAP_TERRAIN_SOURCE_URL or VITE_MAP_TERRAIN_TILES.');
  }
  const tileSize = readNumber(
    environment.VITE_MAP_TERRAIN_TILE_SIZE,
    'VITE_MAP_TERRAIN_TILE_SIZE',
    issues,
    { min: 256, max: 512, integer: true },
  );
  if (tileSize !== undefined && tileSize !== 256 && tileSize !== 512) {
    issues.push('VITE_MAP_TERRAIN_TILE_SIZE must be either 256 or 512.');
  }
  const exaggeration = readNumber(
    environment.VITE_MAP_TERRAIN_EXAGGERATION,
    'VITE_MAP_TERRAIN_EXAGGERATION',
    issues,
    { min: 0.1, max: 10 },
  );

  if (issues.length > 0) return { requested, configured: false, options: null, issues };
  return {
    requested,
    configured: true,
    options: {
      enabled: true,
      sourceId,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(tiles ? { tiles } : {}),
      ...(tileSize !== undefined ? { tileSize } : {}),
      ...(exaggeration !== undefined ? { exaggeration } : {}),
    },
    issues,
  };
}

function resolveBuildings(environment: MapCapabilityEnvironment): CapabilityConfiguration<BuildingOptions> {
  const issues: string[] = [];
  const requested = readOptInBoolean(environment, 'VITE_MAP_BUILDINGS_ENABLED', issues);
  if (!requested) return { requested, configured: false, options: null, issues };

  const sourceId = readRequiredString(environment, 'VITE_MAP_BUILDINGS_SOURCE_ID', issues);
  const sourceLayer = readRequiredString(environment, 'VITE_MAP_BUILDINGS_SOURCE_LAYER', issues);
  const layerId = environment.VITE_MAP_BUILDINGS_LAYER_ID?.trim() || undefined;
  const minZoom = readNumber(
    environment.VITE_MAP_BUILDINGS_MIN_ZOOM,
    'VITE_MAP_BUILDINGS_MIN_ZOOM',
    issues,
    { min: 0, max: 24 },
  );

  if (issues.length > 0) return { requested, configured: false, options: null, issues };
  return {
    requested,
    configured: true,
    options: {
      enabled: true,
      sourceId,
      sourceLayer,
      ...(layerId ? { layerId } : {}),
      ...(minZoom !== undefined ? { minZoom } : {}),
    },
    issues,
  };
}

export function resolveMapCapabilityConfiguration(
  environment: MapCapabilityEnvironment,
): MapCapabilityConfiguration {
  const terrain = resolveTerrain(environment);
  const buildings = resolveBuildings(environment);
  return {
    terrain,
    buildings,
    issues: [...terrain.issues, ...buildings.issues],
  };
}
