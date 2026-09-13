import { LANGUAGE_DATA_VERSION, type PlaceName } from '../language';
import type { WorldCountryFeature } from './countries';

export const COUNTRY_LANGUAGE_DATA_VERSION = LANGUAGE_DATA_VERSION;

export type CuratedCountryNameSource = {
  featureId: string;
  sourceName: 'Wikidata';
  entityId: string;
  revisionId: number;
  revisionUrl: string;
  retrievedAt: string;
  license: 'CC0-1.0';
  names: readonly PlaceName[];
};

const japanNames = [
  {
    locale: 'ja',
    script: 'Hani',
    value: '日本',
    kind: 'short',
    isPreferred: true,
  },
  {
    locale: 'ja',
    script: 'Hira',
    value: 'にほん',
    kind: 'reading',
    isPreferred: true,
  },
  {
    locale: 'ja',
    script: 'Hira',
    value: 'にっぽん',
    kind: 'reading',
    isPreferred: false,
  },
  {
    locale: 'ja-Latn',
    script: 'Latn',
    value: 'Nihon-koku',
    kind: 'romanized',
    isPreferred: true,
  },
  {
    locale: 'ja-Latn',
    script: 'Latn',
    value: 'Nippon-koku',
    kind: 'romanized',
    isPreferred: false,
  },
] as const satisfies readonly PlaceName[];

const koreaNames = [
  {
    locale: 'ko',
    script: 'Kore',
    value: '대한민국',
    kind: 'official',
    isPreferred: true,
  },
  {
    locale: 'ko',
    script: 'Kore',
    value: '한국',
    kind: 'short',
    isPreferred: false,
  },
  {
    locale: 'ko-Latn',
    script: 'Latn',
    value: 'Daehan Minguk',
    kind: 'romanized',
    isPreferred: true,
  },
  {
    locale: 'ko-Latn',
    script: 'Latn',
    value: 'Daehanminguk',
    kind: 'romanized',
    isPreferred: false,
  },
] as const satisfies readonly PlaceName[];

/**
 * Deliberately tiny hand-reviewed override. Do not expand this from every
 * Wikidata alias: many aliases are historic, rhetorical, or lack the name-kind
 * provenance required by the answer resolver.
 */
export const CURATED_COUNTRY_NAME_SOURCES: readonly CuratedCountryNameSource[] = [
  {
    featureId: 'natural-earth:country:JPN',
    sourceName: 'Wikidata',
    entityId: 'Q17',
    revisionId: 2518916955,
    revisionUrl: 'https://www.wikidata.org/w/index.php?title=Q17&oldid=2518916955',
    retrievedAt: '2026-07-19T00:00:00.000Z',
    license: 'CC0-1.0',
    names: japanNames,
  },
  {
    featureId: 'natural-earth:country:KOR',
    sourceName: 'Wikidata',
    entityId: 'Q884',
    revisionId: 2517817603,
    revisionUrl: 'https://www.wikidata.org/w/index.php?title=Q884&oldid=2517817603',
    retrievedAt: '2026-07-19T00:00:00.000Z',
    license: 'CC0-1.0',
    names: koreaNames,
  },
];

const overridesByFeatureId = new Map(
  CURATED_COUNTRY_NAME_SOURCES.map((source) => [source.featureId, source.names]),
);

/**
 * Migrates only Natural Earth's locale-explicit fields. The legacy `aliases`
 * array is intentionally ignored because each item's locale and kind are not
 * known.
 */
export function placeNamesForWorldCountry(
  properties: WorldCountryFeature['properties'],
): PlaceName[] {
  const localizedNames: PlaceName[] = [
    ...(properties.nameKo
      ? [{
          locale: 'ko',
          script: 'Kore',
          value: properties.nameKo,
          kind: 'localized' as const,
          isPreferred: true,
        }]
      : []),
    {
      locale: 'en',
      script: 'Latn',
      value: properties.nameEn,
      kind: 'localized',
      isPreferred: true,
    },
  ];
  return [
    ...localizedNames,
    ...(overridesByFeatureId.get(properties.id) ?? []),
  ];
}

export function localizedScopeNames(nameKo: string, nameEn: string): PlaceName[] {
  return [
    {
      locale: 'ko',
      script: 'Kore',
      value: nameKo,
      kind: 'localized',
      isPreferred: true,
    },
    {
      locale: 'en',
      script: 'Latn',
      value: nameEn,
      kind: 'localized',
      isPreferred: true,
    },
  ];
}
