import type { GeoFeatureType } from '../../src/geodata/types';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorldCountryIndexSchema } from '../../src/geodata/countries';
import { WorldPopulatedPlacesIndexSchema } from '../../src/geodata/populatedPlaces';
import { loadDiskCatalog } from './catalogIo';

const { manifest, features } = await loadDiskCatalog();
const byType = features.reduce<Partial<Record<GeoFeatureType, number>>>((counts, feature) => {
  counts[feature.featureType] = (counts[feature.featureType] ?? 0) + 1;
  return counts;
}, {});
const byCountry = features.reduce<Record<string, number>>((counts, feature) => {
  const key = feature.countryCode ?? 'global';
  counts[key] = (counts[key] ?? 0) + 1;
  return counts;
}, {});
const [countryIndexPayload, populatedPlacesIndexPayload] = await Promise.all([
  readFile(resolve(process.cwd(), 'public/geodata/world/countries-index.json'), 'utf8'),
  readFile(resolve(process.cwd(), 'public/geodata/world/populated-places-index.json'), 'utf8'),
]);
const countryIndex = WorldCountryIndexSchema.parse(JSON.parse(countryIndexPayload) as unknown);
const populatedPlacesIndex = WorldPopulatedPlacesIndexSchema.parse(
  JSON.parse(populatedPlacesIndexPayload) as unknown,
);

console.log(
  JSON.stringify(
    {
      catalogVersion: manifest.catalogVersion,
      scopeLabel: manifest.scopeLabel,
      scopeComplete: manifest.scopeComplete,
      sourceVersions: manifest.sourceVersions,
      totals: manifest.totals,
      byType,
      byCountry,
      productionWorld: {
        catalogVersion: 'natural-earth-admin0-and-populated-places-5.1.1-5.1.2',
        scopeComplete: false,
        countries: countryIndex.countryCount,
        continents: countryIndex.continentCount,
        populatedPlaces: populatedPlacesIndex.featureCount,
        populatedPlaceTypes: populatedPlacesIndex.featureTypeCounts,
        capitals: populatedPlacesIndex.capitalCount,
        countriesWithPlaces: populatedPlacesIndex.countryCount,
        totalFeatures: 1 + countryIndex.continentCount + countryIndex.countryCount + populatedPlacesIndex.featureCount,
        sourceVersions: {
          'natural-earth-countries': countryIndex.source.version,
          'natural-earth-populated-places': populatedPlacesIndex.source.version,
        },
      },
    },
    null,
    2,
  ),
);
