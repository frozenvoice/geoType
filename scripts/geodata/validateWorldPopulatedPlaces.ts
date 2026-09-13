import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  WorldCountryIndexSchema,
} from '../../src/geodata/countries';
import {
  NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION,
  NATURAL_EARTH_POPULATED_PLACES_SOURCE,
  NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION,
  WorldPopulatedPlacesIndexSchema,
} from '../../src/geodata/populatedPlaces';
import { GeoFeatureCollectionSchema } from '../../src/geodata/schemas';
import { inspectPlaceNameWarnings, PlaceNamesSchema } from '../../src/language';

const worldDirectory = resolve(process.cwd(), 'public/geodata/world');
const [placesPayload, placesIndexPayload, countriesIndexPayload] = await Promise.all([
  readFile(resolve(worldDirectory, 'populated-places.json'), 'utf8'),
  readFile(resolve(worldDirectory, 'populated-places-index.json'), 'utf8'),
  readFile(resolve(worldDirectory, 'countries-index.json'), 'utf8'),
]);

const collection = GeoFeatureCollectionSchema.parse(JSON.parse(placesPayload) as unknown);
const index = WorldPopulatedPlacesIndexSchema.parse(JSON.parse(placesIndexPayload) as unknown);
const countries = WorldCountryIndexSchema.parse(JSON.parse(countriesIndexPayload) as unknown);
const countryIds = new Set(countries.countries.map((country) => country.id));
const ids = new Set<string>();
let warningCount = 0;
let capitalCount = 0;

for (const feature of collection.features) {
  if (feature.source !== 'natural-earth' || feature.sourceVersion !== NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION) {
    throw new Error(`Unexpected source metadata on populated place ${feature.id}.`);
  }
  if (feature.featureType !== 'city' && feature.featureType !== 'town') {
    throw new Error(`Unexpected feature type on populated place ${feature.id}.`);
  }
  if (!/^natural-earth:place:\d+$/.test(feature.id)) {
    throw new Error(`Invalid populated place id ${feature.id}.`);
  }
  if (ids.has(feature.id)) throw new Error(`Duplicate populated place id ${feature.id}.`);
  ids.add(feature.id);
  if (feature.parentIds.length !== 1 || !countryIds.has(feature.parentIds[0] ?? '')) {
    throw new Error(`Populated place ${feature.id} must have one existing country parent.`);
  }
  if (feature.countryCode && !countries.countries.some((country) => country.isoAlpha2 === feature.countryCode)) {
    throw new Error(`Populated place ${feature.id} references unknown country code ${feature.countryCode}.`);
  }
  const names = PlaceNamesSchema.parse(feature.names);
  warningCount += inspectPlaceNameWarnings(names).length;
  if (!names.some((name) => name.locale === 'ko' && name.kind === 'localized' && name.isPreferred)) {
    throw new Error(`Populated place ${feature.id} is missing the source-provided Korean name.`);
  }
  if (!names.some((name) => name.locale === 'en' && name.kind === 'localized' && name.isPreferred)) {
    throw new Error(`Populated place ${feature.id} is missing the source-provided English name.`);
  }
  if (feature.capital === true) capitalCount += 1;
}

if (warningCount > 0) throw new Error(`Populated place language data has ${warningCount} quality warnings.`);
if (index.catalogVersion !== NATURAL_EARTH_POPULATED_PLACES_CATALOG_VERSION) {
  throw new Error('Populated places catalog version is inconsistent.');
}
const geoJsonSha256 = createHash('sha256').update(placesPayload).digest('hex');
if (index.geoJsonSha256 !== geoJsonSha256) throw new Error('Populated places GeoJSON checksum is inconsistent.');
if (index.geoJsonByteSize !== Buffer.byteLength(placesPayload)) throw new Error('Populated places GeoJSON byte size is inconsistent.');
if (index.source.archiveSha256 !== NATURAL_EARTH_POPULATED_PLACES_SOURCE.archiveSha256) {
  throw new Error('Populated places source archive checksum is inconsistent.');
}
if (index.featureCount !== collection.features.length) throw new Error('Populated place count is inconsistent.');
if (index.capitalCount !== capitalCount) throw new Error('Populated place capital count is inconsistent.');
console.log(
  `World populated places valid: ${collection.features.length} features (${index.featureTypeCounts.city} cities, ${index.featureTypeCounts.town} towns), ${index.countryCount} countries, ${capitalCount} capitals, Natural Earth ${NATURAL_EARTH_POPULATED_PLACES_SOURCE_VERSION}.`,
);
console.log('Korean and English names are sourced from Natural Earth locale-explicit fields; no generated translations or aliases.');
