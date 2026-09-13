import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import maplibregl, {
  type Map as MapInstance,
  type MapMouseEvent,
  type MapStyleImageMissingEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import type { GeoFeature, GeoGeometry } from '../geodata/types';
import { filterEligibleFeatures, selectionStore } from '../selection';
import type { BuildingOptions, TerrainOptions } from './capabilities';
import { createBrowseCameraPlan, createFeatureCameraPlan } from './framing';
import {
  combineMapFilters,
  createBuildingLayerSpecification,
  createCatalogFeatureCollection,
  createCatalogLayerSpecifications,
  createCountryFeatureCollection,
  createCountryLayerSpecifications,
  createHoverLayerSpecifications,
  createNoMatchFeatureFilter,
  createTargetFeatureCollection,
  createTargetLabelCollection,
  createTargetLayerSpecifications,
  createTargetNameExclusionFilter,
  defaultLabelHidingStrategy,
  deriveInteractiveLayerIds,
  MAP_LAYER_IDS,
  MAP_SOURCE_IDS,
  type LabelHidingStrategy,
  type MapStyleLayer,
} from './layers';
import { registerPMTilesProtocol } from './pmtiles';
import { PMTilesMapProvider } from './providers';
import { evaluateMapReadiness } from './readiness';
import {
  createMapResourceLoadError,
  MapResourceLoadError,
} from './resourceErrors';
import {
  inspectMapStyle,
  type MapStyleDiagnostics,
} from './styleDiagnostics';
import type {
  CapabilityState,
  MapDifficulty,
  MapMode,
  MapPadding,
  MapProvider,
  MapReadiness,
  MapSelectionEvent,
} from './types';
import { resolveCapabilityState } from './types';
import { createJourneyCollection, createJourneyLayers, JOURNEY_SOURCE_ID, type JourneyStop } from './journey';
import './map.css';

export type MapLibreRendererProps = {
  provider: MapProvider;
  mode: MapMode;
  catalogFeatures?: readonly GeoFeature[];
  targetFeature?: GeoFeature | null;
  targetDisplayName?: string;
  visited?: readonly JourneyStop[];
  questionKey?: string;
  difficulty?: MapDifficulty;
  reducedMotion?: boolean;
  hudPadding?: Partial<MapPadding>;
  selectionLayerIds?: string[];
  terrain?: TerrainOptions;
  buildings?: BuildingOptions;
  labelHidingStrategy?: LabelHidingStrategy;
  answerNames?: readonly string[];
  syncSelectionStore?: boolean;
  resolveRenderedFeature?: (event: MapSelectionEvent) => GeoFeature | null;
  onFeatureHover?: (event: MapSelectionEvent | null, feature: GeoFeature | null) => void;
  onFeatureSelect?: (event: MapSelectionEvent, feature: GeoFeature | null) => void;
  onSelectionFeedback?: (message: string) => void;
  onMapReady?: (readiness: MapReadiness) => void;
  onQuestionReady?: (readiness: MapReadiness) => void;
  onCapabilityChange?: (capabilities: CapabilityState) => void;
  onStyleLoad?: (diagnostics: MapStyleDiagnostics) => void;
  onError?: (error: MapResourceLoadError) => void;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

type LabelLayerOriginalState = {
  filter: unknown[] | null;
  visibility: unknown;
};

type TooltipState = {
  name: string;
  x: number;
  y: number;
};

type MutableGeoJsonSource = {
  setData(data: unknown): void;
};

type TestMapController = {
  centerOn(center: [number, number], zoom: number, pitch?: number): Promise<void>;
  project(position: [number, number]): { x: number; y: number };
  getDiagnostics(): {
    clickEvents: number;
    lastSelectionId: string | null;
    lastHoverSelectionId: string | null;
    style: MapStyleDiagnostics | null;
    center: [number, number];
    zoom: number;
    pitch: number;
    tilesLoaded: boolean;
  };
};

type WindowWithTestMap = Window & {
  __GEOTYPE_E2E_MAP__?: TestMapController;
};

const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection' as const,
  features: [],
};
const EMPTY_CATALOG_FEATURES: readonly GeoFeature[] = [];
const EMPTY_SELECTION_LAYER_IDS: string[] = [];
const EMPTY_ANSWER_NAMES: readonly string[] = [];
const EMPTY_JOURNEY: readonly JourneyStop[] = [];

function asError(value: unknown) {
  return value instanceof Error ? value : new Error(String(value));
}

function asMapResourceLoadError(value: unknown, resourceType = '지도 렌더러') {
  if (value instanceof MapResourceLoadError) return value;
  const error = asError(value);
  return new MapResourceLoadError({
    message: error.message,
    resourceType,
    cause: error,
  });
}

function isSupportedGeometry(value: unknown): value is GeoGeometry {
  if (!value || typeof value !== 'object' || !('type' in value) || !('coordinates' in value)) {
    return false;
  }
  const type = (value as { type: unknown }).type;
  return (
    type === 'Point' ||
    type === 'LineString' ||
    type === 'MultiLineString' ||
    type === 'Polygon' ||
    type === 'MultiPolygon'
  );
}

function styleLayers(map: MapInstance): MapStyleLayer[] {
  return (map.getStyle().layers ?? []).map((layer) => ({
    id: layer.id,
    type: layer.type,
    ...('source' in layer && typeof layer.source === 'string' ? { source: layer.source } : {}),
    ...('source-layer' in layer && typeof layer['source-layer'] === 'string'
      ? { 'source-layer': layer['source-layer'] }
      : {}),
    ...(layer.layout ? { layout: layer.layout } : {}),
    ...('metadata' in layer && layer.metadata
      ? { metadata: layer.metadata as Record<string, unknown> }
      : {}),
  }));
}

function updateGeoJsonSource(map: MapInstance, sourceId: string, data: unknown) {
  const source = map.getSource(sourceId) as MutableGeoJsonSource | undefined;
  source?.setData(data);
}

function eligibleCatalogFeatures(
  features: readonly GeoFeature[],
  mode: MapMode,
  selectedFeature: GeoFeature | null,
  zoom: number,
): GeoFeature[] {
  if (mode !== 'browse') return features.filter((feature) =>
    feature.featureType !== 'country' && feature.featureType !== 'continent');
  const eligible = filterEligibleFeatures(features, {
    zoom,
    ...(selectedFeature ? { parentFeatureType: selectedFeature.featureType } : {}),
  });

  // Countries have their own stable, application-owned hit layer, while the
  // basemap already supplies world/continent labels. Feeding the synthetic
  // world MultiPolygon to a symbol layer places one “세계” label on every
  // polygon, so broad navigation scopes must stay out of the generic detail
  // overlay as well.
  return eligible.filter(
    (feature) => feature.featureType !== 'country' && feature.featureType !== 'continent',
  );
}

function updateCatalogForView(
  map: MapInstance,
  features: readonly GeoFeature[],
  mode: MapMode,
  selectedFeature: GeoFeature | null,
  catalogIndex: Map<string, GeoFeature>,
) {
  const eligible = eligibleCatalogFeatures(features, mode, selectedFeature, map.getZoom());
  catalogIndex.clear();
  for (const feature of eligible) catalogIndex.set(feature.id, feature);
  updateGeoJsonSource(
    map,
    MAP_SOURCE_IDS.catalog,
    createCatalogFeatureCollection(eligible, mode, selectedFeature?.id ?? null),
  );
}

function addGeoJsonSourceIfMissing(map: MapInstance, sourceId: string) {
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
      promoteId: 'id',
    });
  }
}

function replaceTargetLayers(map: MapInstance, mode: MapMode, allowTextLayers: boolean) {
  const knownLayerIds = Object.values(MAP_LAYER_IDS);
  for (const id of [...knownLayerIds].reverse()) {
    if (id.startsWith('geotype-target') && map.getLayer(id)) map.removeLayer(id);
  }
  for (const layer of createTargetLayerSpecifications(mode)) {
    if (layer.type === 'symbol' && !allowTextLayers) continue;
    map.addLayer(layer as never);
  }
}

function ensureHoverLayers(map: MapInstance) {
  for (const layer of createHoverLayerSpecifications()) {
    if (!map.getLayer(layer.id)) map.addLayer(layer as never);
  }
}

function ensureCountryLayers(map: MapInstance, selectedCountryId: string | null) {
  for (const layer of createCountryLayerSpecifications(selectedCountryId)) {
    if (!map.getLayer(layer.id)) map.addLayer(layer as never);
  }
  map.setFilter(
    MAP_LAYER_IDS.countrySelected,
    (selectedCountryId
      ? ['==', ['get', 'id'], selectedCountryId]
      : createNoMatchFeatureFilter()) as never,
  );
}

function replaceCatalogLayers(
  map: MapInstance,
  mode: MapMode,
  difficulty: MapDifficulty,
  allowTextLayers: boolean,
) {
  const catalogLayerIds = [
    MAP_LAYER_IDS.catalogFill,
    MAP_LAYER_IDS.catalogOutline,
    MAP_LAYER_IDS.catalogLine,
    MAP_LAYER_IDS.catalogPoint,
    MAP_LAYER_IDS.catalogLabel,
  ];
  for (const id of [...catalogLayerIds].reverse()) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const layer of createCatalogLayerSpecifications(mode, difficulty)) {
    if (layer.type === 'symbol' && !allowTextLayers) continue;
    map.addLayer(layer as never);
  }
}

function applyGlobePresentation(map: MapInstance) {
  map.setProjection({ type: 'globe' });
  try {
    map.setSky({
      'sky-color': '#071a2c',
      'sky-horizon-blend': 0.42,
      'horizon-color': '#4a7b96',
      'horizon-fog-blend': 0.18,
      'fog-color': '#06101c',
      'fog-ground-blend': 0.55,
    });
  } catch {
    // Older MapLibre builds can render globe projection without setSky.
  }
}

function applyCapabilities(
  map: MapInstance,
  provider: MapProvider,
  terrain: TerrainOptions | undefined,
  buildings: BuildingOptions | undefined,
  styleDiagnostics: MapStyleDiagnostics,
  reportError: (error: MapResourceLoadError) => void,
) {
  let capabilityState = resolveCapabilityState(provider, {
    ...(terrain ? { terrain: terrain.enabled } : {}),
    ...(buildings ? { buildings: buildings.enabled } : {}),
  });

  const styleBuilding = styleDiagnostics.building;
  if (provider.supportsBuildings && styleBuilding) {
    try {
      map.setLayerZoomRange(
        styleBuilding.layerId,
        styleBuilding.minZoom,
        styleBuilding.maxZoom ?? 24,
      );
      map.setLayoutProperty(styleBuilding.layerId, 'visibility', 'visible');
      capabilityState = {
        ...capabilityState,
        buildings: { enabled: true, reason: 'enabled' },
      };
    } catch (error) {
      reportError(asMapResourceLoadError(error, '3D 건물 레이어'));
      capabilityState = {
        ...capabilityState,
        buildings: { enabled: false, reason: 'activation-failed' },
      };
    }
  }

  if (capabilityState.terrain.enabled && terrain) {
    try {
      if (!map.getSource(terrain.sourceId)) {
        if (!terrain.sourceUrl && !terrain.tiles?.length) {
          throw new Error(
            `Terrain source “${terrain.sourceId}” is not present in the style and no DEM URL or tiles were configured.`,
          );
        }
        map.addSource(terrain.sourceId, {
          type: 'raster-dem',
          tileSize: terrain.tileSize ?? 512,
          ...(terrain.sourceUrl ? { url: terrain.sourceUrl } : {}),
          ...(terrain.tiles?.length ? { tiles: terrain.tiles } : {}),
        });
      }
      map.setTerrain({ source: terrain.sourceId, exaggeration: terrain.exaggeration ?? 1.15 });
    } catch (error) {
      reportError(asMapResourceLoadError(error, 'DEM terrain'));
      capabilityState = {
        ...capabilityState,
        terrain: { enabled: false, reason: 'activation-failed' },
      };
    }
  }

  if (!styleBuilding && capabilityState.buildings.enabled && buildings) {
    try {
      const layerId = buildings.layerId ?? 'geotype-3d-buildings';
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', 'visible');
      } else if (!map.getSource(buildings.sourceId)) {
        throw new Error(`Building source “${buildings.sourceId}” is not present in the map style.`);
      } else {
        const firstLabel = styleLayers(map).find(
          (layer) => layer.type === 'symbol' && layer.layout?.['text-field'] !== undefined,
        );
        map.addLayer(
          createBuildingLayerSpecification(buildings) as never,
          firstLabel?.id,
        );
      }
    } catch (error) {
      reportError(asMapResourceLoadError(error, '3D 건물 레이어'));
      capabilityState = {
        ...capabilityState,
        buildings: { enabled: false, reason: 'activation-failed' },
      };
    }
  }

  return capabilityState;
}

function createSelectionEvent(event: MapMouseEvent, map: MapInstance, layerIds: string[]) {
  if (layerIds.length === 0) return null;
  const renderedFeatures = map.queryRenderedFeatures(event.point, { layers: layerIds });
  const rendered = renderedFeatures.find((feature) => feature.source === MAP_SOURCE_IDS.catalog)
    ?? renderedFeatures[0];
  if (!rendered) return null;

  const properties = (rendered.properties ?? {}) as Record<string, unknown>;
  const nameValue = properties.name_ko ?? properties['name:ko'] ?? properties.name ?? properties.name_en;
  const safeName = typeof nameValue === 'string' || typeof nameValue === 'number'
    ? String(nameValue)
    : 'feature';
  const fallbackId = `${rendered.source}:${rendered.sourceLayer ?? rendered.layer.id}:${safeName}`;
  const idValue = rendered.id ?? properties.id ?? properties.wikidata ?? properties.osm_id;
  const id =
    typeof idValue === 'string' || typeof idValue === 'number'
      ? String(idValue)
      : fallbackId;
  const geometry = isSupportedGeometry(rendered.geometry) ? rendered.geometry : null;

  return {
    id,
    ...(typeof nameValue === 'string' && nameValue.trim() ? { name: nameValue } : {}),
    layerId: rendered.layer.id,
    sourceId: rendered.source,
    ...(rendered.sourceLayer ? { sourceLayer: rendered.sourceLayer } : {}),
    properties,
    geometry,
    lngLat: [event.lngLat.lng, event.lngLat.lat] as [number, number],
    originalEvent: event.originalEvent,
  } satisfies MapSelectionEvent;
}

function applyCameraPlan(map: MapInstance, plan: ReturnType<typeof createFeatureCameraPlan>) {
  // MapLibre keeps camera padding between transitions. Passing the next HUD
  // padding without clearing it makes cameraForBounds count both values; on a
  // narrow viewport that can leave a negative fitting area and crash globe
  // camera calculation. Each plan is absolute, so reset retained padding first.
  map.stop();
  map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
  if (plan.method === 'fitBounds') {
    map.fitBounds(plan.bounds, {
      padding: plan.padding,
      maxZoom: plan.maxZoom,
      pitch: plan.pitch,
      bearing: plan.bearing,
      duration: plan.duration,
    });
    return;
  }
  if (plan.method === 'flyTo') {
    map.flyTo({
      center: plan.center,
      zoom: plan.zoom,
      padding: plan.padding,
      pitch: plan.pitch,
      bearing: plan.bearing,
      duration: plan.duration,
      essential: plan.essential,
    });
    return;
  }
  map.easeTo({
    center: plan.center,
    zoom: plan.zoom,
    padding: plan.padding,
    pitch: plan.pitch,
    bearing: plan.bearing,
    duration: plan.duration,
  });
}

export function MapLibreRenderer({
  provider,
  mode,
  catalogFeatures = EMPTY_CATALOG_FEATURES,
  targetFeature = null,
  targetDisplayName,
  visited = EMPTY_JOURNEY,
  questionKey,
  difficulty = 'normal',
  reducedMotion = false,
  hudPadding,
  selectionLayerIds = EMPTY_SELECTION_LAYER_IDS,
  terrain,
  buildings,
  labelHidingStrategy = defaultLabelHidingStrategy,
  answerNames = EMPTY_ANSWER_NAMES,
  syncSelectionStore = true,
  resolveRenderedFeature,
  onFeatureHover,
  onFeatureSelect,
  onSelectionFeedback,
  onMapReady,
  onQuestionReady,
  onCapabilityChange,
  onStyleLoad,
  onError,
  className = '',
  style,
  ariaLabel = '상호작용 가능한 3D 지구 지도',
}: MapLibreRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const modeRef = useRef(mode);
  const interactiveLayerIdsRef = useRef<string[]>([]);
  const catalogIndexRef = useRef(new Map<string, GeoFeature>());
  const countryIndexRef = useRef(new Map<string, GeoFeature>());
  const countryDatasetRef = useRef<readonly GeoFeature[] | null>(null);
  const catalogFeaturesRef = useRef(catalogFeatures);
  const targetFeatureRef = useRef(targetFeature);
  const originalLabelStateRef = useRef(new Map<string, LabelLayerOriginalState>());
  const activeTransitionRef = useRef(0);
  const lastCameraKeyRef = useRef('');
  const testDiagnosticsRef = useRef({
    clickEvents: 0,
    lastSelectionId: null as string | null,
    lastHoverSelectionId: null as string | null,
  });
  const [mapInstance, setMapInstance] = useState<MapInstance | null>(null);
  const [capabilityState, setCapabilityState] = useState<CapabilityState | null>(null);
  const [styleDiagnostics, setStyleDiagnostics] = useState<MapStyleDiagnostics | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const callbackRef = useRef({
    resolveRenderedFeature,
    onFeatureHover,
    onFeatureSelect,
    onSelectionFeedback,
    onMapReady,
    onQuestionReady,
    onCapabilityChange,
    onStyleLoad,
    onError,
    syncSelectionStore,
  });
  callbackRef.current = {
    resolveRenderedFeature,
    onFeatureHover,
    onFeatureSelect,
    onSelectionFeedback,
    onMapReady,
    onQuestionReady,
    onCapabilityChange,
    onStyleLoad,
    onError,
    syncSelectionStore,
  };
  modeRef.current = mode;
  catalogFeaturesRef.current = catalogFeatures;
  targetFeatureRef.current = targetFeature;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (provider instanceof PMTilesMapProvider) {
        registerPMTilesProtocol(maplibregl, provider.archiveUrl);
      }

      const styleUrl = provider.getStyleUrl();
      const requestedResourceTypes = new Map<string, string>();
      let loadedStyleDiagnostics: MapStyleDiagnostics | null = null;
      const map = new maplibregl.Map({
        container,
        style: styleUrl,
        center: [0, 18],
        zoom: 1.35,
        minZoom: 0.35,
        maxZoom: 19,
        pitch: 0,
        bearing: 0,
        attributionControl: false,
        renderWorldCopies: false,
        transformRequest: (url: string, resourceType?: maplibregl.ResourceType) => {
          const type = resourceType ?? 'Unknown';
          const transformed = provider.transformRequest?.(url, type) ?? { url };
          requestedResourceTypes.set(transformed.url, type);
          return transformed;
        },
      });
      mapRef.current = map;
      const testWindow = window as WindowWithTestMap;
      const searchParameters = new URLSearchParams(window.location.search);
      const installTestController = (
        (provider.id === 'test' && searchParameters.get('e2e') === '1') ||
        searchParameters.get('mapDiagnostics') === '1'
      );
      const testDiagnostics = testDiagnosticsRef.current;
      testDiagnostics.clickEvents = 0;
      testDiagnostics.lastSelectionId = null;
      testDiagnostics.lastHoverSelectionId = null;
      const testController: TestMapController | null = installTestController
        ? {
            centerOn: async (center, zoom, pitch = 0) => {
              await new Promise<void>((resolve) => {
                let finished = false;
                const finish = () => {
                  if (finished) return;
                  finished = true;
                  map.off('idle', check);
                  map.off('styledata', check);
                  resolve();
                };
                const check = () => {
                  if (map.getSource(MAP_SOURCE_IDS.catalog) && map.getLayer(MAP_LAYER_IDS.catalogFill)) {
                    finish();
                  }
                };
                map.on('idle', check);
                map.on('styledata', check);
                check();
                window.setTimeout(finish, 3_000);
              });
              await new Promise<void>((resolve) => {
                let finished = false;
                const finish = () => {
                  if (finished) return;
                  finished = true;
                  resolve();
                };
                void map.once('render', finish);
                map.stop();
                map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
                map.jumpTo({ center, zoom, pitch, bearing: 0 });
                window.setTimeout(finish, 250);
              });
            },
            project: (position) => {
              const point = map.project(position);
              return { x: point.x, y: point.y };
            },
            getDiagnostics: () => {
              const center = map.getCenter();
              return {
                ...testDiagnostics,
                style: loadedStyleDiagnostics,
                center: [center.lng, center.lat],
                zoom: map.getZoom(),
                pitch: map.getPitch(),
                tilesLoaded: map.areTilesLoaded(),
              };
            },
          }
        : null;
      if (testController) testWindow.__GEOTYPE_E2E_MAP__ = testController;

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');
      map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          ...(provider.attribution ? { customAttribution: provider.attribution } : {}),
        }),
        'bottom-right',
      );

      const reportError = (error: MapResourceLoadError) => callbackRef.current.onError?.(error);
      const handleStyleImageMissing = (event: MapStyleImageMissingEvent) => {
        // Vector tiles can reference optional POI icons that are not present in
        // a style's sprite sheet. MapLibre exposes this event specifically so
        // applications can provide a deterministic fallback instead of
        // emitting a missing-image warning for every affected tile.
        if (map.hasImage(event.id)) return;
        map.addImage(event.id, {
          width: 1,
          height: 1,
          data: new Uint8Array([0, 0, 0, 0]),
        });
      };
      const handleError = (event: unknown) => {
        reportError(createMapResourceLoadError(event, requestedResourceTypes, styleUrl));
      };

      const handleMouseMove = (event: MapMouseEvent) => {
        if (modeRef.current !== 'browse') return;
        const detailHit = map.getLayer(MAP_LAYER_IDS.catalogPoint)
          && map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.catalogPoint] }).length > 0;
        if (detailHit && map.getLayer(MAP_LAYER_IDS.countryHover)) {
          map.setFilter(MAP_LAYER_IDS.countryHover, createNoMatchFeatureFilter() as never);
        }
        if (
          !detailHit &&
          map.getLayer(MAP_LAYER_IDS.countryHit) &&
          map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.countryHit] }).length > 0
        ) {
          return;
        }
        const renderedSelection = createSelectionEvent(event, map, interactiveLayerIdsRef.current);
        const catalogFeature = renderedSelection
          ? catalogIndexRef.current.get(renderedSelection.id) ??
            callbackRef.current.resolveRenderedFeature?.(renderedSelection) ??
            null
          : null;
        const selection = catalogFeature ? renderedSelection : null;
        testDiagnostics.lastHoverSelectionId = selection?.id ?? null;
        container.style.cursor = catalogFeature ? 'pointer' : '';

        if (selection?.geometry) {
          updateGeoJsonSource(map, MAP_SOURCE_IDS.hover, {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: selection.id,
                properties: { id: selection.id },
                geometry: selection.geometry,
              },
            ],
          });
        } else {
          updateGeoJsonSource(map, MAP_SOURCE_IDS.hover, EMPTY_FEATURE_COLLECTION);
        }

        if (selection?.name) {
          setTooltip({ name: selection.name, x: event.point.x, y: event.point.y });
        } else {
          setTooltip(null);
        }
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().setHoveredFeature(catalogFeature);
        }
        callbackRef.current.onFeatureHover?.(selection, catalogFeature);
      };

      const handleMouseLeave = () => {
        container.style.cursor = '';
        setTooltip(null);
        updateGeoJsonSource(map, MAP_SOURCE_IDS.hover, EMPTY_FEATURE_COLLECTION);
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().setHoveredFeature(null);
        }
        callbackRef.current.onFeatureHover?.(null, null);
      };

      const handleZoomEnd = () => {
        updateCatalogForView(
          map,
          catalogFeaturesRef.current,
          modeRef.current,
          targetFeatureRef.current,
          catalogIndexRef.current,
        );
      };

      const handleClick = (event: MapMouseEvent) => {
        if (modeRef.current !== 'browse') return;
        if (!map.getLayer(MAP_LAYER_IDS.countryHit)) {
          callbackRef.current.onSelectionFeedback?.('국가 경계 데이터를 불러오는 중입니다. 잠시 후 다시 클릭해 주세요.');
          return;
        }
        const detailHit = map.getLayer(MAP_LAYER_IDS.catalogPoint)
          && map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.catalogPoint] }).length > 0;
        if (!detailHit && map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.countryHit] }).length > 0) {
          // The dedicated layer-bound handler below owns country selection.
          return;
        }
        testDiagnostics.clickEvents += 1;
        const selection = createSelectionEvent(event, map, interactiveLayerIdsRef.current);
        if (!selection) {
          callbackRef.current.onSelectionFeedback?.('바다를 클릭했습니다. 국가 경계 안쪽을 선택해 주세요.');
          return;
        }
        const catalogFeature =
          catalogIndexRef.current.get(selection.id) ??
          callbackRef.current.resolveRenderedFeature?.(selection) ??
          null;
        if (!catalogFeature) {
          callbackRef.current.onSelectionFeedback?.('이 지도 요소는 현재 게임에서 지원하지 않습니다.');
          return;
        }
        testDiagnostics.lastSelectionId = catalogFeature.id;
        if (callbackRef.current.syncSelectionStore && catalogFeature) {
          selectionStore.getState().selectFeature(catalogFeature);
        }
        callbackRef.current.onFeatureSelect?.(selection, catalogFeature);
      };

      map.on('error', handleError);
      map.on('styleimagemissing', handleStyleImageMissing);
      map.on('mousemove', handleMouseMove);
      map.on('mouseleave', handleMouseLeave);
      map.on('click', handleClick);
      map.on('zoomend', handleZoomEnd);
      void map.once('load', () => {
        applyGlobePresentation(map);
        loadedStyleDiagnostics = inspectMapStyle(map.getStyle());
        setStyleDiagnostics(loadedStyleDiagnostics);
        setMapInstance(map);
        callbackRef.current.onStyleLoad?.(loadedStyleDiagnostics);
      });

      const resizeObserver = new ResizeObserver(() => map.resize());
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        map.off('error', handleError);
        map.off('styleimagemissing', handleStyleImageMissing);
        map.off('mousemove', handleMouseMove);
        map.off('mouseleave', handleMouseLeave);
        map.off('click', handleClick);
        map.off('zoomend', handleZoomEnd);
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().setHoveredFeature(null);
        }
        if (testController && testWindow.__GEOTYPE_E2E_MAP__ === testController) {
          delete testWindow.__GEOTYPE_E2E_MAP__;
        }
        map.remove();
        mapRef.current = null;
      };
    } catch (error) {
      callbackRef.current.onError?.(asMapResourceLoadError(error));
      return;
    }
  }, [provider]);

  useEffect(() => {
    if (!mapInstance || !styleDiagnostics) return;
    const map = mapInstance;
    const container = containerRef.current;
    if (!container) return;

    const reportError = (error: MapResourceLoadError) => callbackRef.current.onError?.(error);
    try {
      addGeoJsonSourceIfMissing(map, MAP_SOURCE_IDS.target);
      addGeoJsonSourceIfMissing(map, MAP_SOURCE_IDS.targetLabel);
      addGeoJsonSourceIfMissing(map, MAP_SOURCE_IDS.hover);
      addGeoJsonSourceIfMissing(map, MAP_SOURCE_IDS.catalog);
      addGeoJsonSourceIfMissing(map, MAP_SOURCE_IDS.countries);
      const allowTextLayers = Boolean(map.getStyle().glyphs);
      replaceCatalogLayers(map, mode, difficulty, allowTextLayers);
      replaceTargetLayers(map, mode, allowTextLayers);
      ensureHoverLayers(map);
      const selectedCountryId = mode === 'browse' && targetFeature?.featureType === 'country'
        ? targetFeature.id
        : null;
      ensureCountryLayers(map, selectedCountryId);
      if (countryDatasetRef.current !== catalogFeatures) {
        countryDatasetRef.current = catalogFeatures;
        countryIndexRef.current.clear();
        for (const feature of catalogFeatures) {
          if (feature.featureType === 'country') countryIndexRef.current.set(feature.id, feature);
        }
        updateGeoJsonSource(map, MAP_SOURCE_IDS.countries, createCountryFeatureCollection(catalogFeatures));
      }
      updateCatalogForView(
        map,
        catalogFeatures,
        mode,
        targetFeature,
        catalogIndexRef.current,
      );
      updateGeoJsonSource(
        map,
        MAP_SOURCE_IDS.target,
        createTargetFeatureCollection(targetFeature, mode, targetDisplayName),
      );
      updateGeoJsonSource(map, MAP_SOURCE_IDS.targetLabel,
        mode === 'reveal' ? createTargetLabelCollection(targetFeature, targetDisplayName) : EMPTY_FEATURE_COLLECTION);
      if (mode !== 'browse') {
        setTooltip(null);
        updateGeoJsonSource(map, MAP_SOURCE_IDS.hover, EMPTY_FEATURE_COLLECTION);
        map.setFilter(MAP_LAYER_IDS.countryHover, createNoMatchFeatureFilter() as never);
      }

      const currentStyleLayers = styleLayers(map);
      for (const layer of currentStyleLayers) {
        if (layer.type !== 'symbol' || layer.layout?.['text-field'] === undefined) continue;
        if (!originalLabelStateRef.current.has(layer.id)) {
          originalLabelStateRef.current.set(layer.id, {
            filter: (map.getFilter(layer.id) as unknown[] | null | undefined) ?? null,
            visibility: map.getLayoutProperty(layer.id, 'visibility') ?? 'visible',
          });
        }
      }

      for (const [layerId, original] of originalLabelStateRef.current) {
        if (!map.getLayer(layerId)) continue;
        map.setFilter(layerId, original.filter as never);
        map.setLayoutProperty(layerId, 'visibility', original.visibility);
      }

      const rules = labelHidingStrategy({
        mode,
        difficulty,
        target: targetFeature,
        answerNames,
        styleLayers: currentStyleLayers,
      });
      for (const rule of rules) {
        if (!map.getLayer(rule.layerId)) continue;
        const original = originalLabelStateRef.current.get(rule.layerId);
        if (!original) continue;
        if (rule.action === 'hide') {
          map.setLayoutProperty(rule.layerId, 'visibility', 'none');
        } else if (rule.action === 'show') {
          map.setLayoutProperty(rule.layerId, 'visibility', original.visibility);
          map.setFilter(rule.layerId, original.filter as never);
        } else {
          const exclusion = createTargetNameExclusionFilter(rule.targetNames ?? []);
          map.setFilter(rule.layerId, combineMapFilters(original.filter, exclusion) as never);
        }
      }

      const capabilities = applyCapabilities(
        map,
        provider,
        terrain,
        buildings,
        styleDiagnostics,
        reportError,
      );
      setCapabilityState(capabilities);
      callbackRef.current.onCapabilityChange?.(capabilities);
      interactiveLayerIdsRef.current = deriveInteractiveLayerIds(
        styleLayers(map),
        selectionLayerIds,
      );
      interactiveLayerIdsRef.current.push(
        MAP_LAYER_IDS.catalogFill,
        MAP_LAYER_IDS.catalogOutline,
        MAP_LAYER_IDS.catalogLine,
        MAP_LAYER_IDS.catalogPoint,
      );

      const clearCountryHover = () => {
        if (map.getLayer(MAP_LAYER_IDS.countryHover)) {
          map.setFilter(MAP_LAYER_IDS.countryHover, createNoMatchFeatureFilter() as never);
        }
        container.style.cursor = '';
        setTooltip(null);
        testDiagnosticsRef.current.lastHoverSelectionId = null;
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().setHoveredFeature(null);
        }
        callbackRef.current.onFeatureHover?.(null, null);
      };

      const handleCountryMove = (event: MapMouseEvent) => {
        if (modeRef.current !== 'browse') return;
        if (map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.catalogPoint] }).length > 0) return;
        const selection = createSelectionEvent(event, map, [MAP_LAYER_IDS.countryHit]);
        if (!selection) {
          clearCountryHover();
          return;
        }
        const feature = countryIndexRef.current.get(selection.id) ?? null;
        if (!feature) {
          clearCountryHover();
          return;
        }
        map.setFilter(MAP_LAYER_IDS.countryHover, ['==', ['get', 'id'], feature.id] as never);
        container.style.cursor = 'pointer';
        setTooltip({
          name: feature.localizedNames.ko ?? feature.localizedNames.en ?? feature.name,
          x: event.point.x,
          y: event.point.y,
        });
        testDiagnosticsRef.current.lastHoverSelectionId = feature.id;
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().setHoveredFeature(feature);
        }
        callbackRef.current.onFeatureHover?.(selection, feature);
      };

      const handleCountryClick = (event: MapMouseEvent) => {
        if (modeRef.current !== 'browse') return;
        if (map.queryRenderedFeatures(event.point, { layers: [MAP_LAYER_IDS.catalogPoint] }).length > 0) return;
        const selection = createSelectionEvent(event, map, [MAP_LAYER_IDS.countryHit]);
        if (!selection) {
          callbackRef.current.onSelectionFeedback?.('국가 Polygon을 확인하지 못했습니다. 다시 클릭해 주세요.');
          return;
        }
        const feature = countryIndexRef.current.get(selection.id) ?? null;
        if (!feature) {
          callbackRef.current.onSelectionFeedback?.('클릭한 국가와 게임 데이터의 연결을 확인하지 못했습니다.');
          return;
        }
        testDiagnosticsRef.current.clickEvents += 1;
        testDiagnosticsRef.current.lastSelectionId = feature.id;
        if (callbackRef.current.syncSelectionStore) {
          selectionStore.getState().selectFeature(feature);
        }
        callbackRef.current.onFeatureSelect?.(selection, feature);
      };

      map.on('mousemove', MAP_LAYER_IDS.countryHit, handleCountryMove);
      map.on('mouseleave', MAP_LAYER_IDS.countryHit, clearCountryHover);
      map.on('click', MAP_LAYER_IDS.countryHit, handleCountryClick);

      const viewport = {
        width: Math.max(container.clientWidth, 1),
        height: Math.max(container.clientHeight, 1),
      };
      const framingOptions = {
        viewport,
        ...(hudPadding ? { hudPadding } : {}),
        reducedMotion,
      };
      const cameraPlan = targetFeature
        ? createFeatureCameraPlan(targetFeature, mode, framingOptions)
        : createBrowseCameraPlan(framingOptions);
      const cameraKey = `${mode}:${targetFeature?.id ?? 'world'}:${questionKey ?? ''}:${viewport.width}x${viewport.height}`;
      if (lastCameraKeyRef.current !== cameraKey) {
        lastCameraKeyRef.current = cameraKey;
        applyCameraPlan(map, cameraPlan);
      }

      const transitionId = activeTransitionRef.current + 1;
      activeTransitionRef.current = transitionId;
      let idleObserved = map.loaded() && !map.isMoving();
      let reported = false;
      const requiredLayerIds = createTargetLayerSpecifications(mode)
        .filter((layer) => allowTextLayers || layer.type !== 'symbol')
        .map((layer) => layer.id);

      const checkReadiness = () => {
        if (reported || activeTransitionRef.current !== transitionId) return;
        const availableLayerIds = styleLayers(map).map((layer) => layer.id);
        const availableLayerSet = new Set(availableLayerIds);
        const layersExist = requiredLayerIds.every((layerId) => availableLayerSet.has(layerId));
        const renderedTargetFeatures = !targetFeature || !layersExist
          ? []
          : [
              ...map.queryRenderedFeatures({ layers: requiredLayerIds }),
              // On globe projection MapLibre can omit a large MultiPolygon
              // from an unbounded viewport query even while it is visibly
              // rendered. Querying the framed target centroid preserves the
              // explicit feature-ID guard without weakening readiness.
              ...map.queryRenderedFeatures(map.project(targetFeature.centroid), {
                layers: requiredLayerIds,
              }),
            ];
        const targetRendered = !targetFeature || (
          layersExist && renderedTargetFeatures.some((rendered) => {
            const properties = (rendered.properties ?? {}) as Record<string, unknown>;
            const renderedId = rendered.id ?? properties.id ?? properties.featureId;
            return (
              (typeof renderedId === 'string' || typeof renderedId === 'number') &&
              String(renderedId) === targetFeature.id
            );
          })
        );
        const readiness = evaluateMapReadiness({
          mapIdle: idleObserved,
          mapMoving: map.isMoving(),
          sourceLoaded: map.isSourceLoaded(MAP_SOURCE_IDS.target),
          targetRendered,
          requiredLayerIds,
          availableLayerIds,
        });
        if (!readiness.ready) return;
        reported = true;
        const readyPayload: MapReadiness = {
          transitionId,
          ...(questionKey ? { questionKey } : {}),
          mode,
          featureId: targetFeature?.id ?? null,
          mapIdle: true,
          sourceReady: true,
          layersReady: true,
          targetRendered: true,
        };
        callbackRef.current.onMapReady?.(readyPayload);
        callbackRef.current.onQuestionReady?.(readyPayload);
      };

      const handleIdle = () => {
        idleObserved = true;
        checkReadiness();
      };
      const handleSourceData = () => checkReadiness();
      map.on('idle', handleIdle);
      map.on('sourcedata', handleSourceData);
      queueMicrotask(checkReadiness);

      return () => {
        map.off('mousemove', MAP_LAYER_IDS.countryHit, handleCountryMove);
        map.off('mouseleave', MAP_LAYER_IDS.countryHit, clearCountryHover);
        map.off('click', MAP_LAYER_IDS.countryHit, handleCountryClick);
        map.off('idle', handleIdle);
        map.off('sourcedata', handleSourceData);
      };
    } catch (error) {
      reportError(asMapResourceLoadError(error));
      return;
    }
  }, [
    buildings,
    answerNames,
    catalogFeatures,
    difficulty,
    hudPadding,
    labelHidingStrategy,
    mapInstance,
    mode,
    provider,
    reducedMotion,
    selectionLayerIds,
    styleDiagnostics,
    targetFeature,
    terrain,
    targetDisplayName,
    questionKey,
  ]);

  useEffect(() => {
    if (!mapInstance || !styleDiagnostics) return;
    addGeoJsonSourceIfMissing(mapInstance, JOURNEY_SOURCE_ID);
    for (const layer of createJourneyLayers()) {
      if (!mapInstance.getLayer(layer.id)) mapInstance.addLayer(layer as never);
    }
    updateGeoJsonSource(mapInstance, JOURNEY_SOURCE_ID, createJourneyCollection(visited));
  }, [mapInstance, styleDiagnostics, visited]);

  return (
    <div
      className={`maplibre-stage ${className}`.trim()}
      style={style}
      aria-label={ariaLabel}
      data-map-mode={mode}
      data-visited-count={visited.length}
      data-map-provider={provider.id}
      data-map-style-state={styleDiagnostics ? 'loaded' : 'loading'}
      data-map-projection={styleDiagnostics ? 'globe' : 'pending'}
      data-map-source-ids={styleDiagnostics?.sourceIds.join(',') ?? ''}
      data-map-terrain-supported={styleDiagnostics?.terrainSupported ? 'true' : 'false'}
      data-map-building-layer={styleDiagnostics?.building?.layerId ?? ''}
      data-map-building-source={styleDiagnostics?.building?.sourceId ?? ''}
      data-map-building-source-layer={styleDiagnostics?.building?.sourceLayer ?? ''}
      data-map-interactions="drag,scroll,click"
      data-country-source-state={styleDiagnostics && catalogFeatures.some((feature) => feature.featureType === 'country')
        ? 'loaded'
        : 'loading'}
      data-selected-country-id={mode === 'browse' && targetFeature?.featureType === 'country'
        ? targetFeature.id
        : ''}
      data-map-terrain-state={capabilityState?.terrain.enabled
        ? 'active'
        : capabilityState?.terrain.reason ?? 'pending'}
      data-map-buildings-state={capabilityState?.buildings.enabled
        ? 'active'
        : capabilityState?.buildings.reason ?? 'pending'}
    >
      <div ref={containerRef} className="maplibre-stage__canvas" />
      {tooltip ? (
        <div
          className="maplibre-stage__tooltip"
          style={{ transform: `translate(${tooltip.x + 14}px, ${tooltip.y + 14}px)` }}
          role="status"
        >
          {tooltip.name}
        </div>
      ) : null}
    </div>
  );
}

export default MapLibreRenderer;

export const MapLibreMap = MapLibreRenderer;
