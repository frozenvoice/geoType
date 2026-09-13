import type { GeoFeature, GeoFeatureType } from '../geodata/types';

export type FeatureTypeLabelRegion = 'KR' | 'US' | 'JP' | 'fallback';

type FeatureTypeLabelTable = Readonly<Record<GeoFeatureType, string>>;

const fallbackLabels: FeatureTypeLabelTable = {
  continent: '대륙',
  country: '국가',
  admin1: '광역 지역',
  admin2: '세부 행정구역',
  city: '도시',
  town: '소도시',
  village: '마을',
  neighborhood: '지역',
  station: '역',
  landmark: '랜드마크',
  mountain: '산',
  river: '강·하천',
  lake: '호수',
  road: '도로',
  poi: '장소',
};

export const FEATURE_TYPE_LABELS: Readonly<
  Record<FeatureTypeLabelRegion, FeatureTypeLabelTable>
> = {
  KR: {
    continent: '대륙',
    country: '국가',
    admin1: '시·도 / 광역자치단체',
    admin2: '시·군·구',
    city: '도시',
    town: '읍·면',
    village: '마을',
    neighborhood: '동네',
    station: '역',
    landmark: '랜드마크',
    mountain: '산',
    river: '강·하천',
    lake: '호수',
    road: '도로',
    poi: '기타 POI',
  },
  US: {
    ...fallbackLabels,
    admin1: '주',
    admin2: '카운티',
  },
  JP: {
    ...fallbackLabels,
    admin1: '도도부현',
    admin2: '시구정촌',
    city: '도시',
    town: '정',
    village: '촌',
  },
  fallback: fallbackLabels,
};

export function resolveFeatureTypeLabelRegion(
  countryCode?: string | null,
): FeatureTypeLabelRegion {
  const normalized = countryCode?.trim().toUpperCase();
  return normalized === 'KR' || normalized === 'US' || normalized === 'JP'
    ? normalized
    : 'fallback';
}

export function getFeatureTypeLabel(
  featureType: GeoFeatureType,
  countryCode?: string | null,
): string {
  return FEATURE_TYPE_LABELS[resolveFeatureTypeLabelRegion(countryCode)][featureType];
}

function localeCandidates(locale: string): string[] {
  const normalized = locale.trim().replace('_', '-');
  const language = normalized.split('-')[0] ?? normalized;
  return [...new Set([normalized, language, 'ko', 'en'])].filter(Boolean);
}

export function getFeatureDisplayName(feature: GeoFeature, locale = 'ko'): string {
  for (const candidate of localeCandidates(locale)) {
    const versionedName = (feature.names ?? [])
      .filter((name) => name.locale.toLowerCase() === candidate.toLowerCase())
      .sort((left, right) => Number(right.isPreferred) - Number(left.isPreferred))[0];
    if (versionedName?.value.trim()) {
      return versionedName.value.normalize('NFC').trim();
    }
    const localizedName = feature.localizedNames[candidate];
    if (localizedName?.trim()) {
      return localizedName.normalize('NFC').trim();
    }
  }

  return feature.name.normalize('NFC').trim();
}
