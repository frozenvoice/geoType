import type { GeoBounds, GeoFeature, MapMode, MapPadding, MapViewport } from './types';
import { WORLD_SCOPE_FEATURE_ID } from '../geodata/providers';

export type CameraFramingOptions = {
  viewport: MapViewport;
  hudPadding?: Partial<MapPadding>;
  reducedMotion?: boolean;
  parentBounds?: GeoBounds;
};

export type FitBoundsCameraPlan = {
  method: 'fitBounds';
  bounds: GeoBounds;
  padding: MapPadding;
  maxZoom: number;
  pitch: number;
  bearing: number;
  duration: number;
};

export type FlyToCameraPlan = {
  method: 'flyTo';
  center: [number, number];
  zoom: number;
  padding: MapPadding;
  pitch: number;
  bearing: number;
  duration: number;
  essential: boolean;
};

export type EaseToCameraPlan = {
  method: 'easeTo';
  center: [number, number];
  zoom: number;
  padding: MapPadding;
  pitch: number;
  bearing: number;
  duration: number;
};

export type CameraPlan = FitBoundsCameraPlan | FlyToCameraPlan | EaseToCameraPlan;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function resolveHudPadding(
  viewport: MapViewport,
  supplied: Partial<MapPadding> = {},
): MapPadding {
  const mobile = viewport.width < 640;
  const defaults: MapPadding = mobile
    ? { top: 72, right: 24, bottom: 280, left: 24 }
    : { top: 72, right: 72, bottom: 250, left: 72 };
  const maxHorizontal = Math.max(24, Math.floor(viewport.width * 0.38));
  const maxVertical = Math.max(24, Math.floor(viewport.height * 0.64));

  return {
    top: clamp(supplied.top ?? defaults.top, 0, maxVertical),
    right: clamp(supplied.right ?? defaults.right, 0, maxHorizontal),
    bottom: clamp(supplied.bottom ?? defaults.bottom, 0, maxVertical),
    left: clamp(supplied.left ?? defaults.left, 0, maxHorizontal),
  };
}

function expandBounds(bounds: GeoBounds, ratio: number): GeoBounds {
  const [west, south, east, north] = bounds;
  const horizontal = Math.max(Math.abs(east - west), 0.02) * ratio;
  const vertical = Math.max(Math.abs(north - south), 0.02) * ratio;
  return [
    clamp(west - horizontal, -180, 180),
    clamp(south - vertical, -85, 85),
    clamp(east + horizontal, -180, 180),
    clamp(north + vertical, -85, 85),
  ];
}

function hasArea(feature: GeoFeature) {
  return feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon';
}

function isLinear(feature: GeoFeature) {
  return feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
}

function boundsExpansion(feature: GeoFeature) {
  switch (feature.featureType) {
    case 'country':
    case 'continent':
      return 0.08;
    case 'admin1':
    case 'admin2':
      return 0.15;
    case 'neighborhood':
      return 0.25;
    case 'river':
    case 'road':
      return 0.12;
    default:
      return 0.18;
  }
}

function maxZoomForFeature(feature: GeoFeature) {
  const hardMaximum = (() => {
    switch (feature.featureType) {
      case 'continent':
        return 3.2;
      case 'country':
        return 6.2;
      case 'admin1':
        return 8.5;
      case 'admin2':
        return 11;
      case 'neighborhood':
        return 14.5;
      case 'river':
      case 'road':
        return 14;
      default:
        return 16.5;
    }
  })();
  return clamp(feature.recommendedMaxZoom, feature.recommendedMinZoom, hardMaximum);
}

function pointZoom(feature: GeoFeature) {
  const base = (() => {
    switch (feature.featureType) {
      case 'city':
        return feature.population && feature.population > 2_000_000 ? 10 : 11.5;
      case 'town':
        return 12.5;
      case 'village':
        return 13.5;
      case 'station':
        return 16;
      case 'landmark':
      case 'poi':
        return 16.5;
      case 'mountain':
      case 'lake':
        return 13.5;
      default:
        return 12;
    }
  })();
  return clamp(base, feature.recommendedMinZoom, feature.recommendedMaxZoom);
}

function pitchForFeature(feature: GeoFeature) {
  switch (feature.featureType) {
    case 'station':
    case 'landmark':
    case 'poi':
      return 48;
    case 'city':
    case 'town':
    case 'village':
      return 38;
    case 'road':
    case 'river':
      return 28;
    case 'country':
    case 'continent':
      return 8;
    default:
      return 18;
  }
}

export function createBrowseCameraPlan(options: CameraFramingOptions): EaseToCameraPlan {
  const padding = resolveHudPadding(options.viewport, options.hudPadding);
  const availableWidth = Math.max(160, options.viewport.width - padding.left - padding.right);
  const availableHeight = Math.max(160, options.viewport.height - padding.top - padding.bottom);
  const diameter = Math.min(availableWidth, availableHeight) * 0.9;
  return {
    method: 'easeTo',
    center: [0, 18],
    zoom: clamp(Math.log2(diameter * Math.PI / 512), 0.35, 2.5),
    padding,
    pitch: 0,
    bearing: 0,
    duration: options.reducedMotion ? 0 : 900,
  };
}

export function createFeatureCameraPlan(
  feature: GeoFeature,
  mode: MapMode,
  options: CameraFramingOptions,
): CameraPlan {
  const padding = resolveHudPadding(options.viewport, options.hudPadding);
  const duration = options.reducedMotion ? 0 : mode === 'browse' ? 700 : 1_150;

  if (feature.id === WORLD_SCOPE_FEATURE_ID) return createBrowseCameraPlan(options);

  if (hasArea(feature) || isLinear(feature)) {
    return {
      method: 'fitBounds',
      bounds: expandBounds(feature.bbox, boundsExpansion(feature)),
      padding,
      maxZoom: maxZoomForFeature(feature),
      pitch: pitchForFeature(feature),
      bearing: 0,
      duration,
    };
  }

  return {
    method: 'flyTo',
    center: feature.centroid,
    zoom: pointZoom(feature),
    padding,
    pitch: pitchForFeature(feature),
    bearing: 0,
    duration,
    essential: false,
  };
}
