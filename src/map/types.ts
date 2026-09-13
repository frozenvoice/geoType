import type {
  GeoBoundingBox,
  GeoGeometry,
  GeoPosition,
} from '../geodata/types';

export type { GeoFeature, GeoFeatureType, GeoGeometry } from '../geodata/types';
export type GeoBounds = GeoBoundingBox;
export type Position = GeoPosition;

export type MapMode = 'browse' | 'question' | 'reveal';
export type MapDifficulty = 'easy' | 'normal' | 'hard' | 'expert';

export interface MapProvider {
  id: string;
  getStyleUrl(): string;
  transformRequest?(url: string, resourceType: string): {
    url: string;
    headers?: Record<string, string>;
  };
  attribution: string;
  supportsTerrain: boolean;
  supportsBuildings: boolean;
}

export type GeoJsonFeature<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: 'Feature';
  id?: string | number;
  properties: P;
  geometry: GeoGeometry;
};

export type GeoJsonFeatureCollection<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<P>>;
};

export type MapViewport = {
  width: number;
  height: number;
};

export type MapPadding = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type MapSelectionEvent = {
  id: string;
  name?: string;
  layerId: string;
  sourceId: string;
  sourceLayer?: string;
  properties: Record<string, unknown>;
  geometry: GeoGeometry | null;
  lngLat: [number, number];
  originalEvent: MouseEvent;
};

export type MapReadiness = {
  transitionId: number;
  questionKey?: string;
  mode: MapMode;
  featureId: string | null;
  mapIdle: true;
  sourceReady: true;
  layersReady: true;
  targetRendered: true;
};

export type CapabilityRequest = {
  terrain?: boolean;
  buildings?: boolean;
};

export type CapabilityState = {
  terrain: {
    enabled: boolean;
    reason: 'enabled' | 'not-requested' | 'unsupported' | 'activation-failed';
  };
  buildings: {
    enabled: boolean;
    reason: 'enabled' | 'not-requested' | 'unsupported' | 'activation-failed';
  };
};

export function resolveCapabilityState(
  provider: MapProvider,
  request: CapabilityRequest = {},
): CapabilityState {
  const terrainRequested = request.terrain === true;
  const buildingsRequested = request.buildings === true;

  return {
    terrain: {
      enabled: terrainRequested && provider.supportsTerrain,
      reason: !terrainRequested ? 'not-requested' : provider.supportsTerrain ? 'enabled' : 'unsupported',
    },
    buildings: {
      enabled: buildingsRequested && provider.supportsBuildings,
      reason: !buildingsRequested
        ? 'not-requested'
        : provider.supportsBuildings
          ? 'enabled'
          : 'unsupported',
    },
  };
}
