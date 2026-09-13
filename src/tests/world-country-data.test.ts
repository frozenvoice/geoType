import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_WORLD_COUNTRY_DATA_BASE_URL,
  loadWorldCountryDataset,
  WorldCountryFeatureCollectionSchema,
  WorldCountryIndexSchema,
} from '../geodata/countries';
import { WorldPopulatedPlacesIndexSchema } from '../geodata/populatedPlaces';
import { WorldCountryGeoCatalogProvider } from '../geodata/providers';
import { resolveAnswer } from '../language';

const countriesPath = resolve('public/geodata/world/countries.geojson');
const indexPath = resolve('public/geodata/world/countries-index.json');

async function localPayloads(): Promise<{ countries: string; index: string }> {
  const [countries, index] = await Promise.all([
    readFile(countriesPath, 'utf8'),
    readFile(indexPath, 'utf8'),
  ]);
  return { countries, index };
}

async function localPlacePayloads(): Promise<{ places: string; index: string }> {
  const [places, index] = await Promise.all([
    readFile(resolve('public/geodata/world/populated-places.json'), 'utf8'),
    readFile(resolve('public/geodata/world/populated-places-index.json'), 'utf8'),
  ]);
  return { places, index };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('Natural Earth world country dataset', () => {
  it('contains the complete 1:10m Admin-0 country layer and seven continents', async () => {
    const payloads = await localPayloads();
    const collection = WorldCountryFeatureCollectionSchema.parse(
      JSON.parse(payloads.countries) as unknown,
    );
    const index = WorldCountryIndexSchema.parse(JSON.parse(payloads.index) as unknown);

    expect(collection.features).toHaveLength(258);
    expect(index.countryCount).toBe(258);
    expect(index.continents.map((continent) => continent.code)).toEqual([
      'asia',
      'europe',
      'africa',
      'north-america',
      'south-america',
      'oceania',
      'antarctica',
    ]);
    expect(collection.features.every(({ geometry }) =>
      geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')).toBe(true);
    expect(new Set(collection.features.map(({ id }) => id)).size).toBe(258);
  }, 30_000);

  it('keeps real ISO codes searchable and never invents codes for unassigned areas', async () => {
    const { index: payload } = await localPayloads();
    const index = WorldCountryIndexSchema.parse(JSON.parse(payload) as unknown);
    const japan = index.countries.find(({ naturalEarthCode }) => naturalEarthCode === 'JPN');
    const korea = index.countries.find(({ naturalEarthCode }) => naturalEarthCode === 'KOR');
    const france = index.countries.find(({ naturalEarthCode }) => naturalEarthCode === 'FRA');
    const somaliland = index.countries.find(({ naturalEarthCode }) => naturalEarthCode === 'SOL');

    expect(japan).toMatchObject({
      isoAlpha2: 'JP',
      isoAlpha3: 'JPN',
      name: '일본',
      nameEn: 'Japan',
      continentCode: 'asia',
    });
    expect(korea?.aliases).toEqual(expect.arrayContaining(['대한민국', 'South Korea', 'KR', 'KOR']));
    expect(france).toMatchObject({ isoAlpha2: 'FR', isoAlpha3: 'FRA' });
    expect(somaliland).toMatchObject({ isoAlpha2: null, isoAlpha3: null });
    expect(index.isoCodeCounts).toEqual({ alpha2: 238, alpha3: 238, withoutIso: 20 });
  }, 30_000);

  it('loads production data directly and converts it into the shared hierarchy', async () => {
    const payloads = await localPayloads();
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      const payload = url.endsWith('countries.geojson') ? payloads.countries : payloads.index;
      return Promise.resolve(new Response(payload));
    });
    const dataset = await loadWorldCountryDataset({ fetcher });
    const provider = new WorldCountryGeoCatalogProvider({ fetcher, includePopulatedPlaces: false });
    const catalog = await provider.loadInitialCatalog();

    expect(DEFAULT_WORLD_COUNTRY_DATA_BASE_URL).toBe('/geodata/world');
    expect(dataset.collection.features).toHaveLength(258);
    expect(catalog.features).toHaveLength(266);
    expect(catalog.manifest.catalogVersion).toBe('natural-earth-admin0-countries-5.1.1');
    expect(catalog.hierarchy.childrenByParentId.get('natural-earth:continent:asia'))
      .toHaveLength(60);
    expect(catalog.hierarchy.childrenByParentId.get('natural-earth:world')).toHaveLength(7);
    expect(catalog.hierarchy.featuresById.get('natural-earth:country:JPN')).toMatchObject({
      countryCode: 'JP',
      countryCodeAlpha3: 'JPN',
      parentIds: ['natural-earth:continent:asia'],
    });
    expect(fetcher.mock.calls.every(([input]) => !requestUrl(input).endsWith('manifest.json')))
      .toBe(true);
  }, 45_000);

  it('loads the verified populated-place layer under each country', async () => {
    const [payloads, placePayloads] = await Promise.all([localPayloads(), localPlacePayloads()]);
    const placeIndex = WorldPopulatedPlacesIndexSchema.parse(JSON.parse(placePayloads.index) as unknown);
    const fetcher = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.endsWith('countries.geojson')) return Promise.resolve(new Response(payloads.countries));
      if (url.endsWith('countries-index.json')) return Promise.resolve(new Response(payloads.index));
      if (url.endsWith('populated-places.json')) return Promise.resolve(new Response(placePayloads.places));
      return Promise.resolve(new Response(placePayloads.index));
    });
    const catalog = await new WorldCountryGeoCatalogProvider({ fetcher, includePopulatedPlaces: true }).loadInitialCatalog();
    const japanCities = [...(catalog.hierarchy.childrenByParentId.get('natural-earth:country:JPN') ?? [])];

    expect(placeIndex.featureCount).toBe(7293);
    expect(catalog.manifest.catalogVersion).toBe('natural-earth-admin0-and-populated-places-5.1.1-5.1.2');
    expect(catalog.manifest.scopeComplete).toBe(false);
    expect(catalog.features.filter((feature) => feature.featureType === 'city' || feature.featureType === 'town')).toHaveLength(7293);
    expect(japanCities.length).toBeGreaterThan(1);
    expect(japanCities.some((feature) => feature.name === '도쿄도')).toBe(true);
    expect(japanCities.some((feature) => feature.name === '도쿄도' && feature.capital === true)).toBe(true);
    expect(japanCities.every((feature) => feature.parentIds[0] === 'natural-earth:country:JPN')).toBe(true);
  }, 60_000);

  it('migrates only locale-known names and applies sourced JP/KR overrides', async () => {
    const payloads = await localPayloads();
    const fetcher = vi.fn((input: RequestInfo | URL) => Promise.resolve(
      new Response(requestUrl(input).endsWith('countries.geojson')
        ? payloads.countries
        : payloads.index),
    ));
    const catalog = await new WorldCountryGeoCatalogProvider({ fetcher, includePopulatedPlaces: false }).loadInitialCatalog();
    const japan = catalog.hierarchy.featuresById.get('natural-earth:country:JPN');
    const korea = catalog.hierarchy.featuresById.get('natural-earth:country:KOR');
    const world = catalog.hierarchy.featuresById.get('natural-earth:world');

    expect(japan?.names).toEqual(expect.arrayContaining([
      { locale: 'ko', script: 'Kore', value: '일본', kind: 'localized', isPreferred: true },
      { locale: 'en', script: 'Latn', value: 'Japan', kind: 'localized', isPreferred: true },
      { locale: 'ja', script: 'Hani', value: '日本', kind: 'short', isPreferred: true },
      { locale: 'ja', script: 'Hira', value: 'にほん', kind: 'reading', isPreferred: true },
      { locale: 'ja-Latn', script: 'Latn', value: 'Nihon-koku', kind: 'romanized', isPreferred: true },
    ]));
    expect(japan?.names?.some((name) => name.value === 'JPN' || name.value === 'JP')).toBe(false);
    expect(korea?.names).toEqual(expect.arrayContaining([
      { locale: 'ko', script: 'Kore', value: '대한민국', kind: 'official', isPreferred: true },
      { locale: 'ko-Latn', script: 'Latn', value: 'Daehan Minguk', kind: 'romanized', isPreferred: true },
    ]));
    expect(world?.names?.map((name) => name.value)).toEqual(['세계', 'World']);
    expect(catalog.hierarchy.childrenByParentId.get('natural-earth:world')).toHaveLength(7);

    expect(resolveAnswer(japan!, {
      uiLocale: 'ko', typingLanguage: 'ja-kanji', answerPolicy: 'strict',
    })?.target).toBe('日本');
    expect(resolveAnswer(japan!, {
      uiLocale: 'ko', typingLanguage: 'ja-reading', answerPolicy: 'strict',
    })?.acceptedAnswers).toEqual(['にほん', 'にっぽん']);
    expect(resolveAnswer(korea!, {
      uiLocale: 'ko', typingLanguage: 'native', answerPolicy: 'strict',
    })?.target).toBe('대한민국');
    expect(resolveAnswer(korea!, {
      uiLocale: 'ko', typingLanguage: 'romanized', answerPolicy: 'strict',
    })?.target).toBe('Daehan Minguk');
  }, 45_000);
});
