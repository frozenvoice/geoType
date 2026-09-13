import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GeoDataManifestSchema, GeoFeatureCollectionSchema } from '../../src/geodata/schemas';
import type { GeoDataManifest, GeoDataShardDescriptor } from '../../src/geodata/types';
import {
  DEVELOPMENT_CATALOG_VERSION,
  DEVELOPMENT_GENERATED_AT,
  DEVELOPMENT_SOURCE_VERSION,
  developmentFeatureCollections,
} from './developmentFixture';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const outputRoot = resolve(projectRoot, 'public/geodata');

function sha256(payload: string): string {
  return `sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

function assertSupportedFixtureScope(argumentsList: string[]): void {
  const scope = argumentsList.find((argument) => argument.startsWith('--scope='))?.split('=')[1];
  const countries = argumentsList
    .find((argument) => argument.startsWith('--countries='))
    ?.split('=')[1]
    ?.split(',');

  if (scope && scope !== 'world') {
    throw new Error(`Development fixture supports only --scope=world, received ${scope}.`);
  }
  if (countries && countries.some((country) => country !== 'KR')) {
    throw new Error('Development fixture contains only KR; external source adapters are not configured.');
  }
}

async function run(): Promise<void> {
  assertSupportedFixtureScope(process.argv.slice(2));
  const descriptors: GeoDataShardDescriptor[] = [];

  for (const shard of developmentFeatureCollections()) {
    const collection = GeoFeatureCollectionSchema.parse(shard.collection);
    const payload = `${JSON.stringify(collection, null, 2)}\n`;
    const outputPath = resolve(outputRoot, shard.path);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, payload, 'utf8');

    descriptors.push({
      id: shard.id,
      path: `/geodata/${shard.path.replaceAll('\\', '/')}`,
      checksum: sha256(payload),
      byteSize: Buffer.byteLength(payload),
      featureCount: collection.features.length,
      compression: 'none',
      sourceVersion: DEVELOPMENT_SOURCE_VERSION,
      featureTypes: [...new Set(collection.features.map((feature) => feature.featureType))],
      scopeFeatureIds: shard.scopeFeatureIds,
      countryCodes: [...new Set(collection.features.flatMap((feature) => feature.countryCode ?? []))],
      dependsOn: shard.dependsOn,
    });
  }

  const totals = descriptors.reduce(
    (value, descriptor) => ({
      shardCount: value.shardCount + 1,
      featureCount: value.featureCount + descriptor.featureCount,
      byteSize: value.byteSize + descriptor.byteSize,
    }),
    { shardCount: 0, featureCount: 0, byteSize: 0 },
  );

  const manifest: GeoDataManifest = {
    schemaVersion: 1,
    catalogVersion: DEVELOPMENT_CATALOG_VERSION,
    generatedAt: DEVELOPMENT_GENERATED_AT,
    scopeLabel: 'Development fixture: Asia → Republic of Korea → Seoul/Gangwon subset',
    scopeComplete: false,
    disclaimer:
      'DEVELOPMENT FIXTURE ONLY. Simplified custom geometry for pipeline, hierarchy, and UI tests; not authoritative or globally complete.',
    sourceVersions: { custom: DEVELOPMENT_SOURCE_VERSION },
    totals,
    shards: descriptors,
  };

  GeoDataManifestSchema.parse(manifest);
  await mkdir(outputRoot, { recursive: true });
  await writeFile(resolve(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(
    `Generated development geodata fixture: ${totals.featureCount} features in ${totals.shardCount} shards (${totals.byteSize} bytes).`,
  );
  console.log('Scope is intentionally incomplete and must not be described as world coverage.');
}

await run();
