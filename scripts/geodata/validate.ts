import { assertValidGeoCatalog } from '../../src/geodata/validation';
import { GeoFeatureCollectionSchema } from '../../src/geodata/schemas';
import { loadDiskCatalog } from './catalogIo';

const { manifest, features, shardPayloads } = await loadDiskCatalog();
assertValidGeoCatalog(features);

for (const { descriptor, payload } of shardPayloads) {
  const collection = GeoFeatureCollectionSchema.parse(JSON.parse(payload));
  const featureTypes = [...new Set(collection.features.map((feature) => feature.featureType))].sort();
  const descriptorTypes = [...descriptor.featureTypes].sort();
  if (JSON.stringify(featureTypes) !== JSON.stringify(descriptorTypes)) {
    throw new Error(`Shard ${descriptor.id} has inconsistent feature-type metadata.`);
  }

  const countryCodes = [
    ...new Set(collection.features.flatMap((feature) => feature.countryCode ?? [])),
  ].sort();
  if (JSON.stringify(countryCodes) !== JSON.stringify([...descriptor.countryCodes].sort())) {
    throw new Error(`Shard ${descriptor.id} has inconsistent country-code metadata.`);
  }

  if (collection.features.some((feature) => feature.sourceVersion !== descriptor.sourceVersion)) {
    throw new Error(`Shard ${descriptor.id} contains a source-version mismatch.`);
  }
}

console.log(
  `Geodata valid: ${features.length} features, ${manifest.shards.length} shards, catalog ${manifest.catalogVersion}.`,
);
console.log(`Scope: ${manifest.scopeLabel}`);
if (!manifest.scopeComplete) console.log(`Incomplete scope (expected): ${manifest.disclaimer}`);
