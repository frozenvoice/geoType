export const BASE_MAP_QUALITY_CRITERIA = [
  { id: 'world-globe', label: '세계 구면 표현과 전 지구 구도', environmentKey: 'MAP_QUALITY_WORLD_GLOBE_RESULT' },
  { id: 'korea-boundary', label: '대한민국 및 행정 경계 가독성', environmentKey: 'MAP_QUALITY_KOREA_BOUNDARY_RESULT' },
  { id: 'seoul-detail', label: '서울 상세 지형·도로·수계 밀도', environmentKey: 'MAP_QUALITY_SEOUL_DETAIL_RESULT' },
  { id: 'labels', label: '한글 라벨과 목표명 숨김', environmentKey: 'MAP_QUALITY_LABELS_RESULT' },
  { id: 'target-visibility', label: '목표 geometry 대비와 판정 공개', environmentKey: 'MAP_QUALITY_TARGET_VISIBILITY_RESULT' },
  { id: 'camera', label: '범위별 카메라 framing과 전환', environmentKey: 'MAP_QUALITY_CAMERA_RESULT' },
  { id: 'desktop', label: '1440×900 HUD와 지도 구성', environmentKey: 'MAP_QUALITY_DESKTOP_RESULT' },
  { id: 'mobile', label: '390×844 HUD와 지도 구성', environmentKey: 'MAP_QUALITY_MOBILE_RESULT' },
] as const;

export type MapQualityReviewEnvironment = Record<string, string | undefined>;
export type MapQualityCriterionStatus = 'PASS' | 'FAIL' | 'NOT REVIEWED';

export type MapQualityCriterionResult = {
  id: string;
  label: string;
  environmentKey: string;
  status: MapQualityCriterionStatus;
};

export type MapQualityReview = {
  criteria: MapQualityCriterionResult[];
  allPassed: boolean;
  anyFailed: boolean;
  pending: string[];
};

function readCriterionStatus(value: string | undefined): MapQualityCriterionStatus {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'pass') return 'PASS';
  if (normalized === 'fail') return 'FAIL';
  return 'NOT REVIEWED';
}

export function evaluateMapQualityReview(
  environment: MapQualityReviewEnvironment,
  options: { terrainRequired?: boolean; buildingsRequired?: boolean } = {},
): MapQualityReview {
  const definitions: Array<{ id: string; label: string; environmentKey: string }> = [
    ...BASE_MAP_QUALITY_CRITERIA,
    ...(options.terrainRequired === true
      ? [{ id: 'terrain', label: 'DEM terrain 시각 품질', environmentKey: 'MAP_QUALITY_TERRAIN_RESULT' }]
      : []),
    ...(options.buildingsRequired === true
      ? [{ id: 'buildings', label: '3D building extrusion 시각 품질', environmentKey: 'MAP_QUALITY_BUILDINGS_RESULT' }]
      : []),
  ];
  const criteria = definitions.map((definition) => ({
    ...definition,
    status: readCriterionStatus(environment[definition.environmentKey]),
  }));

  return {
    criteria,
    allPassed: criteria.every((criterion) => criterion.status === 'PASS'),
    anyFailed: criteria.some((criterion) => criterion.status === 'FAIL'),
    pending: criteria
      .filter((criterion) => criterion.status === 'NOT REVIEWED')
      .map((criterion) => criterion.environmentKey),
  };
}
