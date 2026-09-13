import { describe, expect, it } from 'vitest';

import {
  deriveDefaultIncludedTypes,
  findScopeRoot,
  getAvailableTypesSignature,
  getBrowseCatalogSummary,
  reconcileIncludedTypes,
} from '../components/browse/browseModel';
import type { GeoFeature } from '../geodata';

function feature(
  id: string,
  featureType: GeoFeature['featureType'],
  extra: Partial<GeoFeature> & Record<string, unknown> = {},
): GeoFeature {
  return {
    id,
    source: 'custom',
    sourceVersion: 'test-v1',
    featureType,
    name: id,
    localizedNames: { ko: id, en: id },
    aliases: [],
    geometry: { type: 'Point', coordinates: [0, 0] },
    centroid: [0, 0],
    bbox: [0, 0, 0, 0],
    parentIds: [],
    recommendedMinZoom: 0,
    recommendedMaxZoom: 24,
    ...extra,
  };
}

describe('browse catalog summaries', () => {
  it('derives country and city preset counts from the loaded catalog', () => {
    const summary = getBrowseCatalogSummary([
      feature('country:a', 'country'),
      feature('country:b', 'country'),
      feature('city:a', 'city'),
      feature('town:a', 'town'),
      feature('village:a', 'village'),
    ]);

    expect(summary.countryCount).toBe(2);
    expect(summary.cityCount).toBe(3);
    expect(summary.capitalCount).toBe(0);
    expect(summary.featureTypeCounts).toMatchObject({ country: 2, city: 1, town: 1, village: 1 });
  });

  it('exposes only explicitly marked capitals to the capital preset', () => {
    const summary = getBrowseCatalogSummary([
      feature('city:marked', 'city', { capital: true }),
      feature('city:unmarked', 'city'),
      feature('country:marked', 'country', { categories: ['capital'] }),
    ]);

    expect(summary.capitalCount).toBe(2);
  });
});

describe('browse included type initialization', () => {
  it('keeps a manual country-only selection when the catalog adds types', () => {
    const previous = {
      rootId: 'country:jp',
      availableTypesSignature: getAvailableTypesSignature(['country', 'city']),
    };
    const next = {
      rootId: 'country:jp',
      availableTypesSignature: getAvailableTypesSignature(['country', 'city', 'station']),
    };

    expect(reconcileIncludedTypes(
      ['country'],
      ['country', 'city', 'station'],
      previous,
      next,
    )).toEqual({ kind: 'preserve', types: ['country'] });
  });

  it('does not reinitialize when the selected root object is replaced unchanged', () => {
    const context = {
      rootId: 'country:jp',
      availableTypesSignature: getAvailableTypesSignature(['country', 'city']),
    };

    expect(reconcileIncludedTypes(
      ['country'],
      ['country', 'city'],
      context,
      { ...context },
    )).toEqual({ kind: 'skip' });
  });

  it('derives defaults only for a genuinely new root', () => {
    const previous = {
      rootId: 'country:jp',
      availableTypesSignature: getAvailableTypesSignature(['country', 'city']),
    };
    const next = {
      rootId: 'country:kr',
      availableTypesSignature: getAvailableTypesSignature(['country', 'city']),
    };

    expect(reconcileIncludedTypes(
      ['country'],
      ['country', 'city'],
      previous,
      next,
    )).toEqual({ kind: 'derive' });
    expect(deriveDefaultIncludedTypes({
      preset: null,
      scopeKind: 'country',
      selectedCountry: true,
      selectedRootType: 'country',
      availableTypes: ['country', 'city'],
      capitalFeatureTypes: [],
    })).toEqual(['city']);
  });
});

describe('browse map selection scope', () => {
  it('keeps a clicked city under its containing country scope', () => {
    const country = feature('country:kr', 'country');
    const city = feature('city:seoul', 'city', { parentIds: [country.id] });

    expect(findScopeRoot(city, [country, city])).toBe(country);
    expect(findScopeRoot(null, [country, city])).toBe(country);
  });

  it('uses an explicitly selected continent or country as the scope root', () => {
    const continent = feature('continent:asia', 'continent');
    const country = feature('country:kr', 'country', { parentIds: [continent.id] });

    expect(findScopeRoot(continent, [continent])).toBe(continent);
    expect(findScopeRoot(country, [continent, country])).toBe(country);
  });
});
