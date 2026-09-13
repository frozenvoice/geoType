import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WorldCountryFeatureCollectionSchema,
  WorldCountryIndexSchema,
} from '../../src/geodata/countries';
import { placeNamesForWorldCountry } from '../../src/geodata/countryNameOverrides';
import { inspectPlaceNameWarnings, PlaceNamesSchema } from '../../src/language';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const worldDataDirectory = resolve(projectRoot, 'public/geodata/world');
const [countriesPayload, indexPayload] = await Promise.all([
  readFile(resolve(worldDataDirectory, 'countries.geojson'), 'utf8'),
  readFile(resolve(worldDataDirectory, 'countries-index.json'), 'utf8'),
]);
const collection = WorldCountryFeatureCollectionSchema.parse(
  JSON.parse(countriesPayload) as unknown,
);
const index = WorldCountryIndexSchema.parse(JSON.parse(indexPayload) as unknown);

const featureIds = new Set(collection.features.map((feature) => feature.id));
const indexIds = new Set(index.countries.map((country) => country.id));
if (
  featureIds.size !== indexIds.size ||
  [...featureIds].some((featureId) => !indexIds.has(featureId))
) {
  throw new Error('Country GeoJSON and index contain different feature ids.');
}

let languageWarningCount = 0;
for (const country of collection.features) {
  const names = PlaceNamesSchema.parse(placeNamesForWorldCountry(country.properties));
  languageWarningCount += inspectPlaceNameWarnings(names).length;
}
if (languageWarningCount > 0) {
  throw new Error(`Country language data has ${languageWarningCount} quality warnings.`);
}

console.log(
  `World countries valid: ${collection.features.length} countries, ${index.continents.length} continents, Natural Earth ${index.source.version} ${index.source.scale}.`,
);
console.log(
  `ISO coverage: alpha-2 ${index.isoCodeCounts.alpha2}, alpha-3 ${index.isoCodeCounts.alpha3}, unavailable ${index.isoCodeCounts.withoutIso}.`,
);
console.log('Country PlaceName migration valid: locale-explicit Natural Earth fields plus JP/KR curated overrides; 0 warnings.');
