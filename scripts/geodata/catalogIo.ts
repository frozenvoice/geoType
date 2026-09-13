import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  GeoDataManifestSchema,
  GeoFeatureCollectionSchema,
} from '../../src/geodata/schemas';
import type {
  GeoDataManifest,
  GeoDataShardDescriptor,
  GeoFeature,
} from '../../src/geodata/types';

export type LoadedDiskCatalog = {
  manifest: GeoDataManifest;
  features: GeoFeature[];
  shardPayloads: Array<{
    descriptor: GeoDataShardDescriptor;
    payload: string;
  }>;
};

function checksum(payload: string): string {
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export async function loadDiskCatalog(
  projectRoot = process.cwd(),
): Promise<LoadedDiskCatalog> {
  const dataRoot = resolve(projectRoot, 'public/geodata');
  const manifestPayload = await readFile(resolve(dataRoot, 'manifest.json'), 'utf8');
  const manifest = GeoDataManifestSchema.parse(JSON.parse(manifestPayload));
  const features: GeoFeature[] = [];
  const shardPayloads: LoadedDiskCatalog['shardPayloads'] = [];

  for (const descriptor of manifest.shards) {
    if (descriptor.compression !== 'none') {
      throw new Error(
        `CLI fixture reader does not transparently decompress ${descriptor.path}; configure a Brotli source adapter.`,
      );
    }

    const relativePath = descriptor.path.replace(/^\/geodata\//, '');
    const payload = await readFile(resolve(dataRoot, relativePath), 'utf8');
    if (Buffer.byteLength(payload) !== descriptor.byteSize) {
      throw new Error(`Byte-size mismatch for shard ${descriptor.id}.`);
    }
    if (checksum(payload) !== descriptor.checksum) {
      throw new Error(`Checksum mismatch for shard ${descriptor.id}.`);
    }

    const collection = GeoFeatureCollectionSchema.parse(JSON.parse(payload));
    if (collection.features.length !== descriptor.featureCount) {
      throw new Error(`Feature-count mismatch for shard ${descriptor.id}.`);
    }

    features.push(...collection.features);
    shardPayloads.push({ descriptor, payload });
  }

  return { manifest, features, shardPayloads };
}
