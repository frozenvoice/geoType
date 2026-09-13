import type {
  GeoFeature,
  GeoJsonFeature,
  GeoJsonFeatureCollection,
  MapDifficulty,
  MapMode,
} from './types';

export const MAP_SOURCE_IDS = {
  countries: 'game-countries-source',
  catalog: 'geotype-catalog',
  target: 'geotype-target',
  targetLabel: 'geotype-target-label-anchor',
  hover: 'geotype-hover',
} as const;

export const MAP_LAYER_IDS = {
  countryHit: 'game-countries-hit',
  countryHover: 'game-countries-hover',
  countrySelected: 'game-countries-selected',
  catalogFill: 'geotype-catalog-fill',
  catalogOutline: 'geotype-catalog-outline',
  catalogLine: 'geotype-catalog-line',
  catalogPoint: 'geotype-catalog-point',
  catalogLabel: 'geotype-catalog-label',
  targetFill: 'geotype-target-fill',
  targetOutline: 'geotype-target-outline',
  targetLineCasing: 'geotype-target-line-casing',
  targetLine: 'geotype-target-line',
  targetPointHalo: 'geotype-target-point-halo',
  targetPoint: 'geotype-target-point',
  targetLabel: 'geotype-target-label',
  hoverFill: 'geotype-hover-fill',
  hoverOutline: 'geotype-hover-outline',
  hoverLine: 'geotype-hover-line',
  hoverPoint: 'geotype-hover-point',
} as const;

/** MapLibre v5 rejects constant comparison arrays as legacy filters. */
export function createNoMatchFeatureFilter(): unknown[] {
  return ['==', ['get', 'id'], '__geotype:no-match__'];
}

export type MapLayerSpecification = {
  id: string;
  type: 'fill' | 'line' | 'circle' | 'symbol' | 'fill-extrusion';
  source: string;
  'source-layer'?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown[];
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

export type MapStyleLayer = {
  id: string;
  type?: string;
  source?: string;
  'source-layer'?: string;
  layout?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type LabelLayerRule = {
  layerId: string;
  action: 'show' | 'hide' | 'hide-target-name';
  targetNames?: string[];
};

export type LabelStrategyContext = {
  mode: MapMode;
  difficulty: MapDifficulty;
  target: GeoFeature | null;
  answerNames?: readonly string[];
  styleLayers: MapStyleLayer[];
};

export type LabelHidingStrategy = (context: LabelStrategyContext) => LabelLayerRule[];

function normalizedNames(feature: GeoFeature | null): string[] {
  if (!feature) return [];
  return Array.from(
    new Set(
      [feature.name, ...Object.values(feature.localizedNames), ...feature.aliases]
        .concat((feature.names ?? []).map((name) => name.value))
        .map((name) => name.normalize('NFC').trim())
        .filter(Boolean),
    ),
  );
}

function isTextLabel(layer: MapStyleLayer) {
  return layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined;
}

export const defaultLabelHidingStrategy: LabelHidingStrategy = ({
  mode,
  target,
  answerNames,
  styleLayers,
}) => {
  const labels = styleLayers.filter(isTextLabel);
  if (mode === 'browse' || mode === 'reveal') {
    return labels.map((layer) => ({ layerId: layer.id, action: 'show' }));
  }

  const targetNames = Array.from(new Set([
    ...normalizedNames(target),
    ...(answerNames ?? []).map((name) => name.normalize('NFC').trim()).filter(Boolean),
  ]));
  // Hiding an entire POI/locality layer also removes the surrounding context
  // that makes the geography question meaningful. Every difficulty therefore
  // masks only names belonging to the current feature.
  return labels.map((layer) => ({
    layerId: layer.id,
    action: 'hide-target-name' as const,
    targetNames,
  }));
};

export function createTargetNameExclusionFilter(targetNames: string[]): unknown[] | null {
  const names = Array.from(new Set(
    targetNames
      .flatMap((name) => [name.normalize('NFC'), name.normalize('NFD')])
      .map((name) => name.trim().toLocaleLowerCase('en-US'))
      .filter(Boolean),
  ));
  if (names.length === 0) return null;

  // A style can keep several language variants on the same vector feature.
  // Checking only the first populated field can leave an English or local
  // alias visible while another locale happens to exist, so every common
  // OpenMapTiles name property is excluded independently.
  const nameProperties = [
    'name',
    'name:ko',
    'name_ko',
    'name:en',
    'name_en',
    'name:latin',
    'name:nonlatin',
    'name_int',
    'name_local',
  ];
  const excludes = nameProperties.map((property) => [
    '!',
    [
      'in',
      ['downcase', ['coalesce', ['get', property], '']],
      ['literal', names],
    ],
  ]);
  return ['all', ...excludes];
}

export function combineMapFilters(
  original: unknown[] | null | undefined,
  additional: unknown[] | null,
): unknown[] | null | undefined {
  if (!additional) return original;
  if (!original) return additional;
  return ['all', original, additional];
}

export function toMapGeoJsonFeature(
  feature: GeoFeature,
  mode: MapMode,
  displayNameOverride?: string,
): GeoJsonFeature {
  const displayName = displayNameOverride
    ?? feature.localizedNames.ko
    ?? feature.localizedNames.en
    ?? feature.name;
  const properties: Record<string, unknown> = {
    id: feature.id,
    featureType: feature.featureType,
    source: feature.source,
    mode,
  };
  if (mode === 'reveal' || mode === 'browse') {
    properties.name = displayName;
    properties.parentIds = feature.parentIds;
  }

  return {
    type: 'Feature',
    id: feature.id,
    properties,
    geometry: feature.geometry,
  };
}

export function createTargetFeatureCollection(
  feature: GeoFeature | null,
  mode: MapMode,
  displayName?: string,
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: feature ? [toMapGeoJsonFeature(feature, mode, displayName)] : [],
  };
}

export function createTargetLabelCollection(feature: GeoFeature | null, displayName?: string): GeoJsonFeatureCollection {
  if (!feature) return { type: 'FeatureCollection', features: [] };
  return { type: 'FeatureCollection', features: [{
    ...toMapGeoJsonFeature(feature, 'reveal', displayName),
    geometry: { type: 'Point', coordinates: feature.centroid },
  }] };
}

export function createCatalogFeatureCollection(
  features: readonly GeoFeature[],
  mode: MapMode,
  targetFeatureId: string | null = null,
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => {
      const hideName = mode === 'question' && feature.id === targetFeatureId;
      const displayName = feature.localizedNames.ko ?? feature.localizedNames.en ?? feature.name;
      return {
        type: 'Feature',
        id: feature.id,
        properties: {
          id: feature.id,
          featureId: feature.id,
          featureType: feature.featureType,
          importance: feature.importance ?? 0,
          recommendedMinZoom: feature.recommendedMinZoom,
          recommendedMaxZoom: feature.recommendedMaxZoom,
          ...(hideName ? {} : { name: displayName }),
        },
        geometry: feature.geometry,
      };
    }),
  };
}

/**
 * Country polygons are an application-owned input surface. They intentionally
 * do not depend on, or try to reverse-map, labels from the basemap style.
 */
export function createCountryFeatureCollection(
  features: readonly GeoFeature[],
): GeoJsonFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features
      .filter((feature) => feature.featureType === 'country')
      .map((feature) => ({
        type: 'Feature',
        id: feature.id,
        properties: {
          id: feature.id,
          featureId: feature.id,
          name: feature.localizedNames.ko ?? feature.localizedNames.en ?? feature.name,
          nameEn: feature.localizedNames.en ?? feature.name,
          countryCode: feature.countryCode ?? '',
          isoAlpha3: feature.countryCodeAlpha3 ?? feature.adminCodes?.[0] ?? '',
        },
        geometry: feature.geometry,
      })),
  };
}

export function createCountryLayerSpecifications(
  selectedCountryId: string | null,
): MapLayerSpecification[] {
  const selectedFilter: unknown[] = selectedCountryId
    ? ['==', ['get', 'id'], selectedCountryId]
    : createNoMatchFeatureFilter();
  return [
    {
      id: MAP_LAYER_IDS.countryHit,
      type: 'fill',
      source: MAP_SOURCE_IDS.countries,
      paint: {
        // Must remain rendered for MapLibre hit testing while staying visually
        // subordinate to the basemap.
        'fill-color': '#58e5ff',
        'fill-opacity': 0.008,
      },
    },
    {
      id: MAP_LAYER_IDS.countryHover,
      type: 'line',
      source: MAP_SOURCE_IDS.countries,
      filter: createNoMatchFeatureFilter(),
      paint: {
        'line-color': '#8df4ff',
        'line-width': 2.6,
        'line-opacity': 0.98,
      },
    },
    {
      id: MAP_LAYER_IDS.countrySelected,
      type: 'fill',
      source: MAP_SOURCE_IDS.countries,
      filter: selectedFilter,
      paint: {
        'fill-color': '#63f5cc',
        'fill-opacity': 0.24,
        'fill-outline-color': '#d9fff5',
      },
    },
  ];
}

function targetColor(mode: MapMode) {
  if (mode === 'reveal') return '#77f7c6';
  if (mode === 'question') return '#ffcf5a';
  return '#5ae6ff';
}

export function createTargetLayerSpecifications(mode: MapMode): MapLayerSpecification[] {
  const color = targetColor(mode);
  const source = MAP_SOURCE_IDS.target;
  const polygonFilter = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
  const lineFilter = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
  const pointFilter = ['==', ['geometry-type'], 'Point'];
  const layers: MapLayerSpecification[] = [
    {
      id: MAP_LAYER_IDS.targetFill,
      type: 'fill',
      source,
      filter: polygonFilter,
      paint: {
        'fill-color': color,
        'fill-opacity': mode === 'reveal' ? 0.28 : 0.2,
      },
    },
    {
      id: MAP_LAYER_IDS.targetOutline,
      type: 'line',
      source,
      filter: polygonFilter,
      paint: {
        'line-color': color,
        'line-opacity': 1,
        'line-width': mode === 'question' ? 4 : 3,
        'line-blur': 0.4,
      },
    },
    {
      id: MAP_LAYER_IDS.targetLineCasing,
      type: 'line',
      source,
      filter: lineFilter,
      paint: {
        'line-color': '#06101c',
        'line-width': 9,
        'line-opacity': 0.75,
      },
    },
    {
      id: MAP_LAYER_IDS.targetLine,
      type: 'line',
      source,
      filter: lineFilter,
      paint: {
        'line-color': color,
        'line-width': 5,
        'line-opacity': 0.95,
      },
    },
    {
      id: MAP_LAYER_IDS.targetPointHalo,
      type: 'circle',
      source,
      filter: pointFilter,
      paint: {
        'circle-radius': 16,
        'circle-color': color,
        'circle-opacity': 0.2,
        'circle-stroke-color': color,
        'circle-stroke-width': 2,
      },
    },
    {
      id: MAP_LAYER_IDS.targetPoint,
      type: 'circle',
      source,
      filter: pointFilter,
      paint: {
        'circle-radius': 7,
        'circle-color': color,
        'circle-stroke-color': '#07111d',
        'circle-stroke-width': 2,
      },
    },
  ];

  if (mode === 'reveal') {
    layers.push({
      id: MAP_LAYER_IDS.targetLabel,
      type: 'symbol',
      source: MAP_SOURCE_IDS.targetLabel,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 18,
        'text-font': ['Noto Sans Regular', 'Arial Unicode MS Regular'],
        'text-offset': [0, 1.35],
        'text-anchor': 'top',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#eafff8',
        'text-halo-color': '#07111d',
        'text-halo-width': 2,
      },
    });
  }

  return layers;
}

export function createHoverLayerSpecifications(): MapLayerSpecification[] {
  const source = MAP_SOURCE_IDS.hover;
  return [
    {
      id: MAP_LAYER_IDS.hoverFill,
      type: 'fill',
      source,
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'fill-color': '#54dcff', 'fill-opacity': 0.12 },
    },
    {
      id: MAP_LAYER_IDS.hoverOutline,
      type: 'line',
      source,
      filter: ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]],
      paint: { 'line-color': '#7ce8ff', 'line-width': 2.5, 'line-opacity': 0.95 },
    },
    {
      id: MAP_LAYER_IDS.hoverLine,
      type: 'line',
      source,
      filter: ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]],
      paint: { 'line-color': '#7ce8ff', 'line-width': 4, 'line-opacity': 0.95 },
    },
    {
      id: MAP_LAYER_IDS.hoverPoint,
      type: 'circle',
      source,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 8,
        'circle-color': '#7ce8ff',
        'circle-stroke-color': '#07111d',
        'circle-stroke-width': 2,
      },
    },
  ];
}

function catalogLabelFilter(mode: MapMode, difficulty: MapDifficulty): unknown[] {
  const hasName = ['has', 'name'];
  if (mode !== 'question' || difficulty === 'easy') return hasName;
  if (difficulty === 'normal') {
    return [
      'all',
      hasName,
      ['in', ['get', 'featureType'], ['literal', ['country', 'admin1', 'admin2', 'city', 'town']]],
    ];
  }
  if (difficulty === 'hard') {
    return [
      'all',
      hasName,
      ['in', ['get', 'featureType'], ['literal', ['country', 'admin1', 'admin2']]],
    ];
  }
  return createNoMatchFeatureFilter();
}

export function createCatalogLayerSpecifications(
  mode: MapMode,
  difficulty: MapDifficulty,
): MapLayerSpecification[] {
  const source = MAP_SOURCE_IDS.catalog;
  const polygonFilter = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
  const lineFilter = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
  const pointFilter = ['==', ['geometry-type'], 'Point'];
  return [
    {
      id: MAP_LAYER_IDS.catalogFill,
      type: 'fill',
      source,
      filter: polygonFilter,
      paint: {
        'fill-color': '#4fc9e6',
        'fill-opacity': mode === 'browse' ? 0.08 : 0.025,
      },
    },
    {
      id: MAP_LAYER_IDS.catalogOutline,
      type: 'line',
      source,
      filter: polygonFilter,
      paint: {
        'line-color': '#76c9dc',
        'line-width': mode === 'browse' ? 1.2 : 0.8,
        'line-opacity': mode === 'browse' ? 0.68 : 0.42,
      },
    },
    {
      id: MAP_LAYER_IDS.catalogLine,
      type: 'line',
      source,
      filter: lineFilter,
      paint: {
        'line-color': ['match', ['get', 'featureType'], 'river', '#55b6dd', '#91a9b8'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 14, 3],
        'line-opacity': mode === 'browse' ? 0.7 : 0.48,
      },
    },
    {
      id: MAP_LAYER_IDS.catalogPoint,
      type: 'circle',
      source,
      filter: pointFilter,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2, 13, 5, 17, 8],
        'circle-color': '#8feaff',
        'circle-stroke-color': '#07111d',
        'circle-stroke-width': 1.5,
        'circle-opacity': mode === 'question' ? 0.66 : 0.9,
      },
    },
    {
      id: MAP_LAYER_IDS.catalogLabel,
      type: 'symbol',
      source,
      filter: catalogLabelFilter(mode, difficulty),
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 8, 12, 14, 14],
        'text-offset': [0, 0.9],
        'text-anchor': 'top',
        'text-optional': true,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#ccecf3',
        'text-halo-color': '#06101c',
        'text-halo-width': 1.5,
      },
    },
  ];
}

export function deriveInteractiveLayerIds(
  styleLayers: MapStyleLayer[],
  configuredLayerIds: string[] = [],
): string[] {
  if (configuredLayerIds.length > 0) {
    const available = new Set(styleLayers.map((layer) => layer.id));
    return Array.from(new Set(configuredLayerIds)).filter((id) => available.has(id));
  }

  // Basemap IDs and properties are provider-specific and must never become
  // gameplay identities. GeoType appends only its own catalog layers after
  // this function returns; callers may still opt into a known custom layer by
  // explicitly passing configuredLayerIds.
  return [];
}

export type BuildingLayerOptions = {
  sourceId: string;
  sourceLayer: string;
  layerId?: string;
  minZoom?: number;
};

export function createBuildingLayerSpecification(
  options: BuildingLayerOptions,
): MapLayerSpecification {
  return {
    id: options.layerId ?? 'geotype-3d-buildings',
    type: 'fill-extrusion',
    source: options.sourceId,
    minzoom: Math.max(14, options.minZoom ?? 14),
    filter: ['any', ['has', 'render_height'], ['has', 'height']],
    layout: { visibility: 'visible' },
    paint: {
      'fill-extrusion-color': [
        'interpolate',
        ['linear'],
        ['coalesce', ['get', 'render_height'], ['get', 'height']],
        0,
        '#466176',
        120,
        '#91b4c5',
      ],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height']],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], ['get', 'min_height'], 0],
      'fill-extrusion-opacity': 0.78,
    },
    'source-layer': options.sourceLayer,
  };
}
