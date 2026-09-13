import type { GeoFeature, GeoFeatureType } from '../geodata/types';

import type {
  FeatureEligibilityCollectionContext,
  FeatureEligibilityContext,
} from './types';

type ZoomRange = Readonly<{ min: number; max: number }>;

const FEATURE_ZOOM_RANGES: Readonly<Record<GeoFeatureType, ZoomRange>> = {
  continent: { min: 0, max: 3 },
  country: { min: 0, max: 5 },
  admin1: { min: 3, max: 7 },
  admin2: { min: 6, max: 10 },
  city: { min: 6, max: 12 },
  town: { min: 7, max: 13 },
  village: { min: 8, max: 13 },
  neighborhood: { min: 9, max: 15 },
  station: { min: 13, max: 24 },
  landmark: { min: 13, max: 24 },
  mountain: { min: 9, max: 24 },
  river: { min: 9, max: 24 },
  lake: { min: 9, max: 24 },
  road: { min: 13, max: 24 },
  poi: { min: 13, max: 24 },
};

const CHILD_FEATURE_TYPES: Readonly<
  Partial<Record<GeoFeatureType, readonly GeoFeatureType[]>>
> = {
  continent: ['country'],
  country: ['admin1', 'admin2', 'city', 'town', 'village', 'mountain', 'river', 'lake'],
  admin1: ['admin2', 'city', 'town', 'village', 'mountain', 'river', 'lake'],
  admin2: [
    'city',
    'town',
    'village',
    'neighborhood',
    'station',
    'landmark',
    'mountain',
    'river',
    'lake',
    'road',
    'poi',
  ],
  city: ['town', 'village', 'neighborhood', 'station', 'landmark', 'mountain', 'river', 'lake', 'road', 'poi'],
  town: ['village', 'neighborhood', 'station', 'landmark', 'mountain', 'river', 'lake', 'road', 'poi'],
  village: ['neighborhood', 'station', 'landmark', 'mountain', 'river', 'lake', 'road', 'poi'],
  neighborhood: ['station', 'landmark', 'mountain', 'river', 'lake', 'road', 'poi'],
};

const ALL_FEATURE_TYPES = Object.freeze(
  Object.keys(FEATURE_ZOOM_RANGES) as GeoFeatureType[],
);

function clampZoom(zoom: number): number {
  return Number.isFinite(zoom) ? Math.max(0, zoom) : 0;
}

function importanceZoomBoost(importance?: number): number {
  if (importance === undefined || !Number.isFinite(importance)) return 0;
  if (importance >= 0.9) return 2;
  if (importance >= 0.7) return 1.25;
  if (importance >= 0.45) return 0.5;
  return 0;
}

function geometryZoomBoost(feature: GeoFeature): number {
  const [minLng, minLat, maxLng, maxLat] = feature.bbox;
  const span = Math.max(Math.abs(maxLng - minLng), Math.abs(maxLat - minLat));
  if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
    if (span >= 5) return 1;
    if (span >= 1) return 0.5;
  }
  if (
    (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString') &&
    span >= 2
  ) {
    return 0.5;
  }
  return 0;
}

export function getDrillDownFeatureTypes(
  parentFeatureType: GeoFeatureType,
): readonly GeoFeatureType[] {
  return CHILD_FEATURE_TYPES[parentFeatureType] ?? [];
}

export function isFeatureTypeEligibleAtZoom(
  featureType: GeoFeatureType,
  zoom: number,
): boolean {
  const normalizedZoom = clampZoom(zoom);
  const range = FEATURE_ZOOM_RANGES[featureType];
  return normalizedZoom >= range.min && normalizedZoom <= range.max;
}

export function isFeatureEligible(
  feature: GeoFeature,
  context: FeatureEligibilityContext,
): boolean {
  if (
    context.parentFeatureType !== undefined &&
    !getDrillDownFeatureTypes(context.parentFeatureType).includes(feature.featureType)
  ) {
    return false;
  }

  if (
    context.minImportance !== undefined &&
    (feature.importance ?? 0) < context.minImportance
  ) {
    return false;
  }

  const zoom = clampZoom(context.zoom);
  const baseRange = FEATURE_ZOOM_RANGES[feature.featureType];
  const minZoom = Math.max(baseRange.min, feature.recommendedMinZoom);
  const maxZoom = Math.min(baseRange.max, feature.recommendedMaxZoom);
  const earlyVisibility = importanceZoomBoost(feature.importance) + geometryZoomBoost(feature);

  return zoom >= Math.max(0, minZoom - earlyVisibility) && zoom <= maxZoom;
}

export function filterEligibleFeatures(
  features: readonly GeoFeature[],
  context: FeatureEligibilityContext,
): GeoFeature[] {
  return features.filter((feature) => isFeatureEligible(feature, context));
}

export function getEligibleFeatureTypes(
  context: FeatureEligibilityCollectionContext,
): GeoFeatureType[] {
  if (context.features !== undefined) {
    return [
      ...new Set(
        filterEligibleFeatures(context.features, context).map(
          (feature) => feature.featureType,
        ),
      ),
    ];
  }

  const zoomEligible = ALL_FEATURE_TYPES.filter((featureType) =>
    isFeatureTypeEligibleAtZoom(featureType, context.zoom),
  );
  if (context.parentFeatureType === undefined) return zoomEligible;

  const allowedChildren = getDrillDownFeatureTypes(context.parentFeatureType);
  return zoomEligible.filter((featureType) => allowedChildren.includes(featureType));
}
