export type MapStyleSource = {
  type?: string;
};

export type MapStyleLayerDiagnosticInput = {
  id: string;
  type?: string;
  source?: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown;
  paint?: Record<string, unknown>;
};

export type MapStyleDiagnosticInput = {
  sources?: Record<string, MapStyleSource>;
  layers?: MapStyleLayerDiagnosticInput[];
};

export type StyleBuildingLayer = {
  layerId: string;
  sourceId: string;
  sourceLayer: string;
  minZoom: number;
  maxZoom?: number;
  heightProperty: string;
  baseProperty?: string;
};

export type MapStyleDiagnostics = {
  sourceIds: string[];
  vectorSourceIds: string[];
  terrainSourceIds: string[];
  terrainSupported: boolean;
  building: StyleBuildingLayer | null;
  hasBuildingFootprints: boolean;
  hasCountryLabels: boolean;
  hasRegionLabels: boolean;
  hasCityLabels: boolean;
  hasRoads: boolean;
  hasWater: boolean;
  hasProgressiveDetail: boolean;
};

function findGetProperties(value: unknown, properties = new Set<string>()): Set<string> {
  if (!Array.isArray(value)) return properties;
  if (value[0] === 'get' && typeof value[1] === 'string') properties.add(value[1]);
  for (const child of value) findGetProperties(child, properties);
  return properties;
}

function serializedLayer(layer: MapStyleLayerDiagnosticInput): string {
  return JSON.stringify([layer.id, layer['source-layer'], layer.filter]).toLowerCase();
}

function discoverBuildingLayer(
  layers: readonly MapStyleLayerDiagnosticInput[],
): StyleBuildingLayer | null {
  for (const layer of layers) {
    if (
      layer.type !== 'fill-extrusion' ||
      typeof layer.source !== 'string' ||
      typeof layer['source-layer'] !== 'string'
    ) continue;

    const heightProperties = findGetProperties(layer.paint?.['fill-extrusion-height']);
    const heightProperty = ['render_height', 'height'].find((name) => heightProperties.has(name));
    if (!heightProperty) continue;
    const baseProperties = findGetProperties(layer.paint?.['fill-extrusion-base']);
    const baseProperty = ['render_min_height', 'min_height'].find((name) => baseProperties.has(name));

    return {
      layerId: layer.id,
      sourceId: layer.source,
      sourceLayer: layer['source-layer'],
      minZoom: Math.max(14, layer.minzoom ?? 14),
      ...(layer.maxzoom !== undefined ? { maxZoom: layer.maxzoom } : {}),
      heightProperty,
      ...(baseProperty ? { baseProperty } : {}),
    };
  }
  return null;
}

export function inspectMapStyle(style: MapStyleDiagnosticInput): MapStyleDiagnostics {
  const sources = style.sources ?? {};
  const layers = style.layers ?? [];
  const sourceIds = Object.keys(sources);
  const vectorSourceIds = sourceIds.filter((id) => sources[id]?.type === 'vector');
  const terrainSourceIds = sourceIds.filter((id) => sources[id]?.type === 'raster-dem');
  const layerText = layers.map(serializedLayer);

  return {
    sourceIds,
    vectorSourceIds,
    terrainSourceIds,
    terrainSupported: terrainSourceIds.length > 0,
    building: discoverBuildingLayer(layers),
    hasBuildingFootprints: layers.some((layer) => (
      layer.type === 'fill' && /building/.test(serializedLayer(layer))
    )),
    hasCountryLabels: layers.some((layer, index) => (
      layer.type === 'symbol' && /country/.test(layerText[index] ?? '')
    )),
    hasRegionLabels: layers.some((layer, index) => (
      layer.type === 'symbol' && /state|region|admin/.test(layerText[index] ?? '')
    )),
    hasCityLabels: layers.some((layer, index) => (
      layer.type === 'symbol' && /city/.test(layerText[index] ?? '')
    )),
    hasRoads: layers.some((layer) => /road|transportation/.test(serializedLayer(layer))),
    hasWater: layers.some((layer) => /water|waterway|hydro/.test(serializedLayer(layer))),
    hasProgressiveDetail: layers.some((layer) => (layer.minzoom ?? 0) >= 12),
  };
}
