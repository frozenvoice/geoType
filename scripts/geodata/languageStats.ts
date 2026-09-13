import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  placeNamesForWorldCountry,
} from '../../src/geodata/countryNameOverrides';
import { WorldCountryFeatureCollectionSchema } from '../../src/geodata/countries';
import { WorldPopulatedPlacesIndexSchema } from '../../src/geodata/populatedPlaces';
import { GeoFeatureCollectionSchema } from '../../src/geodata/schemas';
import {
  findCountryCodesMissingLanguageProfiles,
  getLanguageEligibilityStats,
  type LanguageNamedFeature,
  type TypingLanguage,
} from '../../src/language';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, '../..');
const [countryPayload, placePayload, placeIndexPayload] = await Promise.all([
  readFile(resolve(projectRoot, 'public/geodata/world/countries.geojson'), 'utf8'),
  readFile(resolve(projectRoot, 'public/geodata/world/populated-places.json'), 'utf8'),
  readFile(resolve(projectRoot, 'public/geodata/world/populated-places-index.json'), 'utf8'),
]);
const countryCollection = WorldCountryFeatureCollectionSchema.parse(
  JSON.parse(countryPayload) as unknown,
);
const placeCollection = GeoFeatureCollectionSchema.parse(JSON.parse(placePayload) as unknown);
const placeIndex = WorldPopulatedPlacesIndexSchema.parse(JSON.parse(placeIndexPayload) as unknown);
if (placeIndex.featureCount !== placeCollection.features.length) {
  throw new Error('Populated places index and GeoJSON counts differ.');
}
const countryFeatures: LanguageNamedFeature[] = countryCollection.features.map(({ properties }) => ({
  names: placeNamesForWorldCountry(properties),
  ...(properties.isoAlpha2 ? { countryCode: properties.isoAlpha2 } : {}),
}));
const placeFeatures: LanguageNamedFeature[] = placeCollection.features.map((feature) => ({
  names: feature.names,
  ...(feature.countryCode ? { countryCode: feature.countryCode } : {}),
}));
const features = [...countryFeatures, ...placeFeatures];
const japaneseFeatures = features.filter((feature) => feature.countryCode === 'JP');
const baseSettings = { uiLocale: 'ko' as const, answerPolicy: 'strict' as const };

const labels: Readonly<Record<TypingLanguage, string>> = {
  ko: '한국어',
  en: '영어',
  native: '현지어',
  romanized: '로마자',
  'ja-kanji': '일본어 한자',
  'ja-reading': '일본어 읽기',
};

for (const typingLanguage of [
  'ko',
  'en',
  'native',
  'romanized',
  'ja-kanji',
  'ja-reading',
] as const) {
  const candidates = typingLanguage.startsWith('ja-') ? japaneseFeatures : features;
  const stats = getLanguageEligibilityStats(candidates, {
    ...baseSettings,
    typingLanguage,
  });
  console.log(`${labels[typingLanguage]}:`);
  console.log(`- 전체 지명: ${stats.total}`);
  console.log(`- 출제 가능: ${stats.totalEligible}`);
  console.log(`- 제외: ${stats.excluded}`);
}

const countryCodes = features.flatMap((feature) => feature.countryCode ? [feature.countryCode] : []);
const missingProfiles = findCountryCodesMissingLanguageProfiles(countryCodes);
console.log(`현지어 profile 미등록 ISO 국가/지역: ${missingProfiles.length}`);
console.log(`production 후보: 국가 ${countryFeatures.length} + 도시/수도 ${placeFeatures.length} = ${features.length}`);
