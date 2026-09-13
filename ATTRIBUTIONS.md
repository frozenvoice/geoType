# GeoType attribution

GeoType의 코드 의존성, 게임용 지리 fixture, 런타임 배경 지도는 서로 다른 attribution 영역입니다.

## 런타임 지도 데이터

이 저장소에는 vector/raster basemap, MapLibre style asset, glyph, sprite, PMTiles archive, terrain DEM 또는 3D building dataset 자체가 포함되어 있지 않습니다. 환경 변수가 없을 때는 OpenFreeMap Liberty style과 그 원격 리소스를 런타임에 불러옵니다.

기본 지도 화면에는 로드된 style/source attribution에 따라 다음 원천 링크가 표시됩니다.

- OpenFreeMap: <https://openfreemap.org/>
- OpenMapTiles: <https://www.openmaptiles.org/>
- OpenStreetMap copyright / attribution: <https://www.openstreetmap.org/copyright>

`VITE_MAP_PROVIDER=hosted` 또는 `pmtiles`로 연결한 운영자는 자신이 선택한 다음 항목의 라이선스와 표시 의무를 확인해야 합니다.

- style JSON과 sprite/glyph
- vector/raster tile 원천
- 도로, 경계, 건물, 토지피복, 지명 데이터
- terrain DEM
- PMTiles archive의 원천 및 변환물

MapLibre의 attribution control은 style source가 제공하는 attribution과 GeoType provider attribution을 표시할 수 있지만, 자동 표시만으로 공급자의 계약상 의무가 모두 충족된다고 보장하지 않습니다. 실제 배포 전 공급자 문서에 있는 정확한 문구, 링크, 로고, 가시성 요구사항을 적용하세요.

다른 hosted style 또는 PMTiles로 교체하면 위 기본 문구를 그대로 재사용하지 말고 해당 공급자와 데이터 원천의 정확한 의무를 다시 확인해야 합니다. `TestMapProvider`는 단색 개발 스타일이며 실제 배경 지도 품질이나 데이터 출처를 대표하지 않습니다.

PMTiles 모드에서는 archive의 원천을 코드가 추측하지 않습니다. 실제 공급자가 요구하는 정확한 문구를 `VITE_MAP_ATTRIBUTION`에 설정해야 하며, 이 값이 없으면 GeoType은 PMTiles 지도를 시작하지 않습니다.

## 게임용 국가 경계 — Natural Earth

`public/geodata/world/countries.geojson`과 `countries-index.json`은 Natural Earth **Admin 0 – Countries, 1:10m, version 5.1.1**에서 전처리했습니다.

- Dataset: <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/>
- Terms of Use: <https://www.naturalearthdata.com/about/terms-of-use/>
- License/status: Public domain
- Suggested optional credit: `Made with Natural Earth.`

Natural Earth의 공식 Terms of Use는 사이트에서 제공되는 모든 raster/vector 버전을 public domain으로 선언하며 사용·수정·전자 배포에 별도 허가가 필요하지 않고 credit도 필수가 아니라고 명시합니다. GeoType은 출처 추적과 데이터 품질 감사를 위해 위 attribution을 문서에 유지합니다.

이 layer는 Natural Earth의 de facto disputed-boundary policy를 따릅니다. feature 포함이나 화면 표시는 특정 영토·정부에 대한 GeoType의 법적·정치적 승인 표현이 아닙니다. 상세 변환 방식, 원본/산출물 checksum, ISO 누락 처리와 수량은 [DATA_SOURCES.md](./DATA_SOURCES.md)를 참고하세요.

## 게임용 도시·수도 point — Natural Earth

`public/geodata/world/populated-places.json`과 `populated-places-index.json`은 Natural Earth **Populated Places, 1:10m, version 5.1.2**에서 전처리했습니다. 원본 다운로드는 [Natural Earth Populated Places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/) 페이지와 [공식 NACIS CDN archive](https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip)입니다.

- 라이선스: Public domain (Natural Earth Terms of Use)
- 원본 archive SHA-256: `cd149186f03d2603e0410da399b980a4357d0ac32d3a2305a49ed3dffcc41d7b`
- 변환 결과: 7,293개 city/town point
- 이름 필드: Natural Earth의 `NAME_KO`, `NAME_EN`, `NAMEASCII`만 언어가 명시된 `PlaceName`으로 옮김

Natural Earth가 제공하는 `NAME_JA` 등 locale-specific 필드는 해당 locale 표기로만 유지합니다. 읽기·로마자 변환을 임의로 만들지 않습니다. 분류·parent 연결·제외된 source feature와 checksum은 [DATA_SOURCES.md](./DATA_SOURCES.md)와 `populated-places-index.json`에 기록되어 있습니다.

JP/KR의 제한된 native/reading/romanized country-name override는 Wikidata Q17/Q884 structured entity snapshot을 사용합니다. Wikidata structured data는 [CC0](https://www.wikidata.org/wiki/Wikidata:Copyright)이며, 정확한 revision과 채택한 값은 [LANGUAGE_DATA_MIGRATION.md](./LANGUAGE_DATA_MIGRATION.md)에 기록했습니다.

## 게임용 geodata fixture

`public/geodata/`의 13개 feature는 다음 식별자를 사용합니다.

- source: `custom`
- source version: `development-fixture-2026-07-19`
- catalog version: `dev-fixture-v1`

외부 GeoNames, Overture Maps 또는 OpenStreetMap dataset을 가져오는 adapter는 현재 없습니다. 이 fixture는 pipeline/UI 검증용 간소화 geometry이며 권위 있는 행정 경계나 완전한 위치 목록이 아닙니다. 위 Natural Earth production 국가·도시 layer와 혼동하면 안 됩니다.

저장소에 별도의 데이터 배포 라이선스가 현재 명시되어 있지 않으므로 재배포 조건을 추측하지 않습니다. 실제 데이터 원천을 추가할 때는 [DATA_SOURCES.md](./DATA_SOURCES.md)에 원천, 버전/추출일, URL, 범위, 변환 방식, 라이선스를 기록하고 이 문서에 요구된 attribution 문구를 추가해야 합니다.

## 주요 소프트웨어

현재 lockfile로 설치되는 주요 패키지와 패키지 메타데이터의 라이선스는 다음과 같습니다. 전체 전이 의존성과 정확한 버전은 `package-lock.json` 및 각 패키지의 라이선스 파일을 기준으로 합니다.

| 소프트웨어 | 용도 | 라이선스 | 프로젝트 |
|---|---|---|---|
| MapLibre GL JS | WebGL vector map, globe projection, camera/layer interaction | BSD-3-Clause | <https://maplibre.org/> |
| PMTiles JavaScript | PMTiles protocol/client | BSD-3-Clause | <https://github.com/protomaps/PMTiles> |
| React / React DOM | UI runtime | MIT | <https://react.dev/> |
| Zustand | client state | MIT | <https://github.com/pmndrs/zustand> |
| Zod | runtime schema validation | MIT | <https://zod.dev/> |
| Vite | build/dev tooling | MIT | <https://vite.dev/> |
| Vitest | unit/component tests | MIT | <https://vitest.dev/> |
| Playwright | browser tests | Apache-2.0 | <https://playwright.dev/> |

이 요약은 각 라이선스 원문을 대체하지 않습니다. 배포 산출물의 전체 고지 사항은 최종 dependency tree와 배포 방식에 맞춰 별도로 생성·검토해야 합니다.

## 데이터 추가 시 필요한 기록

새 geodata 또는 basemap source마다 다음 항목을 확인한 뒤 기록하세요.

1. 원천 제공자와 공식 URL
2. dataset/style/archive 버전 또는 추출 날짜
3. 실제 포함 범위와 누락 범위
4. 원본 라이선스와 변환물 재배포 조건
5. 화면에 표시해야 하는 정확한 attribution 문구와 링크
6. 수정·단순화·병합 여부
7. ODbL 등 share-alike 또는 database 권리가 적용되는지 여부

확인하지 못한 출처나 라이선스를 추정해서 추가하지 마세요.
