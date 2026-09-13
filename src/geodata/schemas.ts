import { z } from 'zod';

import { PlaceNamesSchema } from '../language/schemas';
import {
  calculateBoundingBox,
  boundingBoxContainsPoint,
  boundingBoxesEqual,
  positionsEqual,
} from './geometry';
import { GEO_DATA_SOURCES, GEO_FEATURE_TYPES } from './types';

const normalizedText = z.string().min(1).superRefine((value, context) => {
  if (value !== value.normalize('NFC')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Text must be Unicode NFC normalized.',
    });
  }
});

export const GeoPositionSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);

export const GeoBoundingBoxSchema = z
  .tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ])
  .refine(([west, south, east, north]) => west <= east && south <= north, {
    message: 'Bounding box west/south must not exceed east/north.',
  });

const ringSchema = z
  .array(GeoPositionSchema)
  .min(4)
  .superRefine((ring, context) => {
    const first = ring[0];
    const last = ring.at(-1);
    if (!first || !last || !positionsEqual(first, last, 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Polygon rings must be closed.',
      });
    }
  });

export const GeoGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: GeoPositionSchema }),
  z.object({
    type: z.literal('LineString'),
    coordinates: z.array(GeoPositionSchema).min(2),
  }),
  z.object({
    type: z.literal('MultiLineString'),
    coordinates: z.array(z.array(GeoPositionSchema).min(2)).min(1),
  }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ringSchema).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
]);

/** Polygon-only geometry used by country hit-test datasets. */
export const GeoAreaGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ringSchema).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
]);

export const GeoFeatureSchema = z
  .object({
    id: z.string().min(1),
    source: z.enum(GEO_DATA_SOURCES),
    sourceVersion: z.string().min(1),
    featureType: z.enum(GEO_FEATURE_TYPES),
    name: normalizedText,
    localizedNames: z.record(z.string().min(2), normalizedText),
    aliases: z.array(normalizedText),
    names: PlaceNamesSchema.optional(),
    geometry: GeoGeometrySchema,
    centroid: GeoPositionSchema,
    bbox: GeoBoundingBoxSchema,
    parentIds: z.array(z.string().min(1)),
    countryCode: z.string().regex(/^[A-Z]{2}$/).optional(),
    countryCodeAlpha3: z.string().regex(/^[A-Z]{3}$/).optional(),
    naturalEarthCode: z.string().regex(/^[A-Z]{3}$/).optional(),
    continentId: z.string().min(1).optional(),
    nameLocal: normalizedText.optional(),
    adminCodes: z.array(z.string().min(1)).optional(),
    population: z.number().int().nonnegative().optional(),
    importance: z.number().finite().min(0).max(1).optional(),
    capital: z.boolean().optional(),
    recommendedMinZoom: z.number().finite().min(0).max(24),
    recommendedMaxZoom: z.number().finite().min(0).max(24),
  })
  .superRefine((feature, context) => {
    if (feature.recommendedMinZoom > feature.recommendedMaxZoom) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recommendedMaxZoom'],
        message: 'recommendedMaxZoom must be at least recommendedMinZoom.',
      });
    }

    if (new Set(feature.parentIds).size !== feature.parentIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentIds'],
        message: 'parentIds must not contain duplicates.',
      });
    }

    if (feature.parentIds.includes(feature.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['parentIds'],
        message: 'A feature cannot be its own parent.',
      });
    }

    const normalizedAliases = feature.aliases.map((alias) => alias.toLocaleLowerCase());
    if (new Set(normalizedAliases).size !== normalizedAliases.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['aliases'],
        message: 'aliases must be unique after case folding.',
      });
    }

    const calculatedBoundingBox = calculateBoundingBox(feature.geometry);
    if (!boundingBoxesEqual(feature.bbox, calculatedBoundingBox)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bbox'],
        message: `bbox does not match geometry; expected ${JSON.stringify(calculatedBoundingBox)}.`,
      });
    }

    if (!boundingBoxContainsPoint(feature.bbox, feature.centroid)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['centroid'],
        message: 'centroid must be inside the feature bounding box.',
      });
    }

    if (
      feature.geometry.type === 'Point' &&
      !positionsEqual(feature.centroid, feature.geometry.coordinates)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['centroid'],
        message: 'Point centroid must equal its coordinates.',
      });
    }
  });

export const GeoFeatureCollectionSchema = z.object({
  type: z.literal('FeatureCollection'),
  features: z.array(GeoFeatureSchema),
});

export const GeoDataShardDescriptorSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  byteSize: z.number().int().nonnegative(),
  featureCount: z.number().int().nonnegative(),
  compression: z.enum(['none', 'br']),
  sourceVersion: z.string().min(1),
  featureTypes: z.array(z.enum(GEO_FEATURE_TYPES)).min(1),
  scopeFeatureIds: z.array(z.string().min(1)),
  countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)),
  dependsOn: z.array(z.string().min(1)),
});

export const GeoDataManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.string().min(1),
    generatedAt: z.string().datetime(),
    scopeLabel: z.string().min(1),
    scopeComplete: z.boolean(),
    disclaimer: z.string().min(1),
    sourceVersions: z.record(z.string(), z.string().min(1)),
    totals: z.object({
      shardCount: z.number().int().nonnegative(),
      featureCount: z.number().int().nonnegative(),
      byteSize: z.number().int().nonnegative(),
    }),
    shards: z.array(GeoDataShardDescriptorSchema),
  })
  .superRefine((manifest, context) => {
    const ids = manifest.shards.map((shard) => shard.id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shards'],
        message: 'Shard ids must be unique.',
      });
    }

    const paths = manifest.shards.map((shard) => shard.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shards'],
        message: 'Shard paths must be unique.',
      });
    }

    const shardIds = new Set(ids);
    const shardsById = new Map(manifest.shards.map((shard) => [shard.id, shard]));
    for (const shard of manifest.shards) {
      for (const dependencyId of shard.dependsOn) {
        if (!shardIds.has(dependencyId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['shards'],
            message: `${shard.id} references missing shard dependency ${dependencyId}.`,
          });
        }
        if (dependencyId === shard.id) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['shards'],
            message: `${shard.id} cannot depend on itself.`,
          });
        }
      }
    }

    const dependencyVisited = new Set<string>();
    const dependencyPath = new Set<string>();
    const visitDependency = (shardId: string): void => {
      if (dependencyVisited.has(shardId)) return;
      dependencyPath.add(shardId);
      for (const dependencyId of shardsById.get(shardId)?.dependsOn ?? []) {
        if (dependencyPath.has(dependencyId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['shards'],
            message: `Shard dependency cycle connects ${shardId} to ${dependencyId}.`,
          });
          continue;
        }
        if (shardsById.has(dependencyId)) visitDependency(dependencyId);
      }
      dependencyPath.delete(shardId);
      dependencyVisited.add(shardId);
    };
    for (const shardId of shardIds) visitDependency(shardId);

    const calculatedTotals = manifest.shards.reduce(
      (totals, shard) => ({
        shardCount: totals.shardCount + 1,
        featureCount: totals.featureCount + shard.featureCount,
        byteSize: totals.byteSize + shard.byteSize,
      }),
      { shardCount: 0, featureCount: 0, byteSize: 0 },
    );

    if (JSON.stringify(calculatedTotals) !== JSON.stringify(manifest.totals)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['totals'],
        message: `Manifest totals do not match shards; expected ${JSON.stringify(calculatedTotals)}.`,
      });
    }
  });
