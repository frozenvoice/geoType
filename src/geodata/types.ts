import type { PlaceName } from '../language/types';

export const GEO_FEATURE_TYPES = [
  'continent',
  'country',
  'admin1',
  'admin2',
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
] as const;

export type GeoFeatureType = (typeof GEO_FEATURE_TYPES)[number];

export const GEO_DATA_SOURCES = [
  'geonames',
  'natural-earth',
  'overture',
  'osm',
  'custom',
] as const;

export type GeoDataSource = (typeof GEO_DATA_SOURCES)[number];

export type GeoPosition = [longitude: number, latitude: number];
export type GeoBoundingBox = [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type GeoPoint = {
  type: 'Point';
  coordinates: GeoPosition;
};

export type GeoLineString = {
  type: 'LineString';
  coordinates: GeoPosition[];
};

export type GeoMultiLineString = {
  type: 'MultiLineString';
  coordinates: GeoPosition[][];
};

export type GeoPolygon = {
  type: 'Polygon';
  coordinates: GeoPosition[][];
};

export type GeoMultiPolygon = {
  type: 'MultiPolygon';
  coordinates: GeoPosition[][][];
};

export type GeoGeometry =
  | GeoPoint
  | GeoLineString
  | GeoMultiLineString
  | GeoPolygon
  | GeoMultiPolygon;

export type GeoFeature = {
  id: string;
  source: GeoDataSource;
  sourceVersion: string;
  featureType: GeoFeatureType;
  name: string;
  localizedNames: Record<string, string>;
  aliases: string[];
  /** Versioned multilingual names. Legacy fields remain during migration. */
  names?: PlaceName[];
  geometry: GeoGeometry;
  centroid: GeoPosition;
  bbox: GeoBoundingBox;
  parentIds: string[];
  countryCode?: string;
  countryCodeAlpha3?: string;
  naturalEarthCode?: string;
  continentId?: string;
  nameLocal?: string;
  adminCodes?: string[];
  population?: number;
  importance?: number;
  /** True when the source explicitly marks this place as a capital. */
  capital?: boolean;
  recommendedMinZoom: number;
  recommendedMaxZoom: number;
};

export type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: GeoFeature[];
};

export type GeoDataCompression = 'none' | 'br';

/**
 * A shard is independently fetchable and cacheable. `scopeFeatureIds` lists
 * every hierarchy root for which this shard can contribute descendants. It is
 * intentionally manifest metadata so a client need not download every shard
 * merely to discover which one it needs.
 */
export type GeoDataShardDescriptor = {
  id: string;
  path: string;
  checksum: string;
  byteSize: number;
  featureCount: number;
  compression: GeoDataCompression;
  sourceVersion: string;
  featureTypes: GeoFeatureType[];
  scopeFeatureIds: string[];
  countryCodes: string[];
  dependsOn: string[];
};

export type GeoDataManifest = {
  schemaVersion: 1;
  catalogVersion: string;
  generatedAt: string;
  scopeLabel: string;
  scopeComplete: boolean;
  disclaimer: string;
  sourceVersions: Record<string, string>;
  totals: {
    shardCount: number;
    featureCount: number;
    byteSize: number;
  };
  shards: GeoDataShardDescriptor[];
};

export type CachedGeoDataShard = {
  key: string;
  catalogVersion: string;
  checksum: string;
  payload: string;
  storedAt: number;
};
