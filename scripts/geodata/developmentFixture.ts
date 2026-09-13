import { calculateBoundingBox, calculateCentroid } from '../../src/geodata/geometry';
import type {
  GeoFeature,
  GeoFeatureCollection,
  GeoGeometry,
} from '../../src/geodata/types';

export const DEVELOPMENT_SOURCE_VERSION = 'development-fixture-2026-07-19';
export const DEVELOPMENT_CATALOG_VERSION = 'dev-fixture-v1';
export const DEVELOPMENT_GENERATED_AT = '2026-07-19T00:00:00.000Z';

export const FIXTURE_IDS = {
  asia: 'custom:continent:asia',
  korea: 'custom:country:KR',
  seoul: 'custom:admin1:KR-11',
  gangwon: 'custom:admin1:KR-51',
  jongno: 'custom:admin2:KR-11-jongno',
  jung: 'custom:admin2:KR-11-jung',
  yongsan: 'custom:admin2:KR-11-yongsan',
  mapo: 'custom:admin2:KR-11-mapo',
  jeongseon: 'custom:town:jeongseon-eup',
  seoulStation: 'custom:station:seoul',
  hanRiver: 'custom:river:han-seoul',
  sejongDaero: 'custom:road:sejong-daero',
  gyeongbokgung: 'custom:landmark:gyeongbokgung',
} as const;

type FeatureInput = Omit<
  GeoFeature,
  'source' | 'sourceVersion' | 'bbox' | 'centroid' | 'localizedNames' | 'aliases'
> & {
  localizedNames?: Record<string, string>;
  aliases?: string[];
};

function feature(input: FeatureInput): GeoFeature {
  return {
    ...input,
    source: 'custom',
    sourceVersion: DEVELOPMENT_SOURCE_VERSION,
    name: input.name.normalize('NFC'),
    localizedNames: Object.fromEntries(
      Object.entries(input.localizedNames ?? {}).map(([locale, name]) => [
        locale,
        name.normalize('NFC'),
      ]),
    ),
    aliases: (input.aliases ?? []).map((alias) => alias.normalize('NFC')),
    bbox: calculateBoundingBox(input.geometry),
    centroid: calculateCentroid(input.geometry),
  };
}

const asiaGeometry: GeoGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [26, -10],
      [180, -10],
      [180, 80],
      [26, 80],
      [26, -10],
    ],
  ],
};

const koreaGeometry: GeoGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [
      [
        [126.1, 34.3],
        [125.9, 37.8],
        [128.4, 38.6],
        [129.6, 37],
        [129.4, 35.2],
        [127.8, 34.3],
        [126.1, 34.3],
      ],
    ],
    [
      [
        [126.1, 33.1],
        [126.95, 33.1],
        [126.95, 33.55],
        [126.1, 33.55],
        [126.1, 33.1],
      ],
    ],
  ],
};

const seoulGeometry: GeoGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [126.76, 37.43],
      [126.82, 37.65],
      [127.04, 37.7],
      [127.18, 37.63],
      [127.18, 37.47],
      [127.02, 37.43],
      [126.76, 37.43],
    ],
  ],
};

const gangwonGeometry: GeoGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [127.05, 37.02],
      [127.62, 38.3],
      [128.65, 38.6],
      [129.35, 37.25],
      [128.55, 36.85],
      [127.05, 37.02],
    ],
  ],
};

export const developmentFeatureShards: Array<{
  id: string;
  path: string;
  dependsOn: string[];
  scopeFeatureIds: string[];
  features: GeoFeature[];
}> = [
  {
    id: 'world-continents',
    path: 'world/continents.json',
    dependsOn: [],
    scopeFeatureIds: Object.values(FIXTURE_IDS),
    features: [
      feature({
        id: FIXTURE_IDS.asia,
        featureType: 'continent',
        name: 'Asia',
        localizedNames: { ko: '아시아', en: 'Asia' },
        aliases: ['아시아 대륙'],
        geometry: asiaGeometry,
        parentIds: [],
        importance: 1,
        recommendedMinZoom: 0,
        recommendedMaxZoom: 4,
      }),
    ],
  },
  {
    id: 'world-countries',
    path: 'world/countries.json',
    dependsOn: ['world-continents'],
    scopeFeatureIds: Object.values(FIXTURE_IDS),
    features: [
      feature({
        id: FIXTURE_IDS.korea,
        featureType: 'country',
        name: 'Republic of Korea',
        localizedNames: { ko: '대한민국', en: 'Republic of Korea' },
        aliases: ['한국', 'South Korea', 'Korea'],
        geometry: koreaGeometry,
        parentIds: [FIXTURE_IDS.asia],
        countryCode: 'KR',
        importance: 0.94,
        recommendedMinZoom: 3,
        recommendedMaxZoom: 7,
      }),
    ],
  },
  {
    id: 'kr-admin',
    path: 'countries/KR/admin.json',
    dependsOn: ['world-countries'],
    scopeFeatureIds: [
      FIXTURE_IDS.asia,
      FIXTURE_IDS.korea,
      FIXTURE_IDS.seoul,
      FIXTURE_IDS.gangwon,
      FIXTURE_IDS.jongno,
      FIXTURE_IDS.jung,
      FIXTURE_IDS.yongsan,
      FIXTURE_IDS.mapo,
    ],
    features: [
      feature({
        id: FIXTURE_IDS.seoul,
        featureType: 'admin1',
        name: 'Seoul',
        localizedNames: { ko: '서울특별시', en: 'Seoul' },
        aliases: ['서울'],
        geometry: seoulGeometry,
        parentIds: [FIXTURE_IDS.korea],
        countryCode: 'KR',
        adminCodes: ['KR-11'],
        population: 9_334_000,
        importance: 1,
        recommendedMinZoom: 6,
        recommendedMaxZoom: 11,
      }),
      feature({
        id: FIXTURE_IDS.gangwon,
        featureType: 'admin1',
        name: 'Gangwon State',
        localizedNames: { ko: '강원특별자치도', en: 'Gangwon State' },
        aliases: ['강원도'],
        geometry: gangwonGeometry,
        parentIds: [FIXTURE_IDS.korea],
        countryCode: 'KR',
        adminCodes: ['KR-51'],
        importance: 0.7,
        recommendedMinZoom: 6,
        recommendedMaxZoom: 11,
      }),
      feature({
        id: FIXTURE_IDS.jongno,
        featureType: 'admin2',
        name: 'Jongno-gu',
        localizedNames: { ko: '종로구', en: 'Jongno-gu' },
        aliases: ['종로'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.94, 37.57], [126.96, 37.63], [127.02, 37.63],
              [127.03, 37.57], [126.94, 37.57],
            ],
          ],
        },
        parentIds: [FIXTURE_IDS.seoul],
        countryCode: 'KR',
        adminCodes: ['KR-11-110'],
        importance: 0.75,
        recommendedMinZoom: 9,
        recommendedMaxZoom: 14,
      }),
      feature({
        id: FIXTURE_IDS.jung,
        featureType: 'admin2',
        name: 'Jung-gu',
        localizedNames: { ko: '중구', en: 'Jung-gu' },
        aliases: ['서울 중구'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.96, 37.54], [126.99, 37.57], [127.03, 37.57],
              [127.02, 37.54], [126.96, 37.54],
            ],
          ],
        },
        parentIds: [FIXTURE_IDS.seoul],
        countryCode: 'KR',
        adminCodes: ['KR-11-140'],
        importance: 0.75,
        recommendedMinZoom: 9,
        recommendedMaxZoom: 14,
      }),
      feature({
        id: FIXTURE_IDS.yongsan,
        featureType: 'admin2',
        name: 'Yongsan-gu',
        localizedNames: { ko: '용산구', en: 'Yongsan-gu' },
        aliases: ['용산'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.94, 37.49], [126.96, 37.55], [127.03, 37.54],
              [127.02, 37.49], [126.94, 37.49],
            ],
          ],
        },
        parentIds: [FIXTURE_IDS.seoul],
        countryCode: 'KR',
        adminCodes: ['KR-11-170'],
        importance: 0.73,
        recommendedMinZoom: 9,
        recommendedMaxZoom: 14,
      }),
      feature({
        id: FIXTURE_IDS.mapo,
        featureType: 'admin2',
        name: 'Mapo-gu',
        localizedNames: { ko: '마포구', en: 'Mapo-gu' },
        aliases: ['마포'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.84, 37.53], [126.88, 37.59], [126.96, 37.58],
              [126.95, 37.52], [126.84, 37.53],
            ],
          ],
        },
        parentIds: [FIXTURE_IDS.seoul],
        countryCode: 'KR',
        adminCodes: ['KR-11-440'],
        importance: 0.72,
        recommendedMinZoom: 9,
        recommendedMaxZoom: 14,
      }),
    ],
  },
  {
    id: 'kr-populated-places',
    path: 'countries/KR/populated-places.json',
    dependsOn: ['kr-admin'],
    scopeFeatureIds: [
      FIXTURE_IDS.asia,
      FIXTURE_IDS.korea,
      FIXTURE_IDS.gangwon,
      FIXTURE_IDS.jeongseon,
    ],
    features: [
      feature({
        id: FIXTURE_IDS.jeongseon,
        featureType: 'town',
        name: 'Jeongseon-eup',
        localizedNames: { ko: '정선읍', en: 'Jeongseon-eup' },
        aliases: ['정선'],
        geometry: { type: 'Point', coordinates: [128.6608, 37.3807] },
        parentIds: [FIXTURE_IDS.gangwon],
        countryCode: 'KR',
        population: 10_700,
        importance: 0.38,
        recommendedMinZoom: 10,
        recommendedMaxZoom: 16,
      }),
    ],
  },
  {
    id: 'seoul-hydrography',
    path: 'regions/KR-11/hydrography.json',
    dependsOn: ['kr-admin'],
    scopeFeatureIds: [
      FIXTURE_IDS.asia,
      FIXTURE_IDS.korea,
      FIXTURE_IDS.seoul,
      FIXTURE_IDS.hanRiver,
    ],
    features: [
      feature({
        id: FIXTURE_IDS.hanRiver,
        featureType: 'river',
        name: 'Han River',
        localizedNames: { ko: '한강', en: 'Han River' },
        aliases: ['한강 서울 구간'],
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.79, 37.56], [126.86, 37.55], [126.93, 37.52],
            [127.01, 37.52], [127.09, 37.53], [127.17, 37.55],
          ],
        },
        parentIds: [FIXTURE_IDS.seoul],
        countryCode: 'KR',
        importance: 0.9,
        recommendedMinZoom: 9,
        recommendedMaxZoom: 16,
      }),
    ],
  },
  {
    id: 'seoul-places',
    path: 'regions/KR-11/places.json',
    dependsOn: ['kr-admin'],
    scopeFeatureIds: [
      FIXTURE_IDS.asia,
      FIXTURE_IDS.korea,
      FIXTURE_IDS.seoul,
      FIXTURE_IDS.seoulStation,
      FIXTURE_IDS.sejongDaero,
      FIXTURE_IDS.gyeongbokgung,
    ],
    features: [
      feature({
        id: FIXTURE_IDS.seoulStation,
        featureType: 'station',
        name: 'Seoul Station',
        localizedNames: { ko: '서울역', en: 'Seoul Station' },
        aliases: ['서울 철도역'],
        geometry: { type: 'Point', coordinates: [126.9707, 37.5547] },
        parentIds: [FIXTURE_IDS.yongsan, FIXTURE_IDS.seoul],
        countryCode: 'KR',
        importance: 0.92,
        recommendedMinZoom: 14,
        recommendedMaxZoom: 19,
      }),
      feature({
        id: FIXTURE_IDS.sejongDaero,
        featureType: 'road',
        name: 'Sejong-daero',
        localizedNames: { ko: '세종대로', en: 'Sejong-daero' },
        aliases: ['세종로'],
        geometry: {
          type: 'LineString',
          coordinates: [
            [126.9721, 37.5545], [126.9755, 37.5662], [126.9768, 37.5758],
          ],
        },
        parentIds: [FIXTURE_IDS.jung, FIXTURE_IDS.jongno, FIXTURE_IDS.seoul],
        countryCode: 'KR',
        importance: 0.75,
        recommendedMinZoom: 14,
        recommendedMaxZoom: 19,
      }),
      feature({
        id: FIXTURE_IDS.gyeongbokgung,
        featureType: 'landmark',
        name: 'Gyeongbokgung Palace',
        localizedNames: { ko: '경복궁', en: 'Gyeongbokgung Palace' },
        aliases: ['Gyeongbok Palace'],
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [126.973, 37.576], [126.979, 37.576], [126.979, 37.582],
              [126.973, 37.582], [126.973, 37.576],
            ],
          ],
        },
        parentIds: [FIXTURE_IDS.jongno, FIXTURE_IDS.seoul],
        countryCode: 'KR',
        importance: 0.95,
        recommendedMinZoom: 14,
        recommendedMaxZoom: 20,
      }),
    ],
  },
];

export function developmentFeatureCollections(): Array<{
  id: string;
  path: string;
  dependsOn: string[];
  scopeFeatureIds: string[];
  collection: GeoFeatureCollection;
}> {
  return developmentFeatureShards.map((shard) => ({
    id: shard.id,
    path: shard.path,
    dependsOn: shard.dependsOn,
    scopeFeatureIds: shard.scopeFeatureIds,
    collection: { type: 'FeatureCollection', features: shard.features },
  }));
}
