# GeoType 지도 품질 보고서

> 결과: **DEFAULT HOSTED SMOKE PASSED** — 환경 변수 없이 OpenFreeMap Liberty를 실제 브라우저에서 검증했습니다. 별도 provider/DEM/PMTiles는 각각 다시 검수해야 합니다.

## 실행 환경

- 지도 provider: `hosted`
- style URL: `https://tiles.openfreemap.org/styles/liberty`
- style source: `ne2_shaded` (raster), `openmaptiles` (vector)
- WebGL context / globe projection: 성공
- Style JSON, TileJSON, sprite, glyph, 서울 z14 vector tile: HTTP 200 / CORS 허용 확인
- fresh reload 콘솔의 CORS/style/glyph/sprite/tile 오류·경고: 0건

## 지도 기능 설정 및 활성화

### DEM terrain

- 요청됨: 아니요
- 설정 유효: 해당 없음 (요청하지 않음)
- style 지원: 아니요 (`raster-dem` source 없음)
- MapLibre 활성화: 아니요 (`terrainSupported=false`)
- 설정 오류: 없음

### 3D buildings

- style 자동 발견: 예
- 실제 layer: `building-3d`
- source / source-layer: `openmaptiles` / `building`
- 높이 / 바닥 높이: `render_height` / `render_min_height`
- MapLibre 활성화: 예, zoom 14 이상
- 설정 오류: 없음

## 개별 시각 검토 결과

- **PASS** — 세계 구면 표현과 전 지구 구도
- **PASS** — 대한민국 국가 polygon 클릭과 행정 경계 가독성
- **PASS** — 서울의 한강·도로 및 확대별 상세 증가
- **PASS** — 국가·지역·도시 label
- **PASS** — drag, wheel zoom, hierarchy/canvas 선택
- **PASS** — 1440×900 HUD와 지도 구성
- **PASS** — 390×844 HUD와 지도 구성
- **PASS** — zoom 14 이상 실제 3D building extrusion
- **UNSUPPORTED** — 기본 스타일 terrain (사용 가능한 DEM 없음)

`MAP_QUALITY_APPROVED=true` 하나만으로는 이 게이트를 통과할 수 없습니다. 각 항목의 환경 변수에 `pass` 또는 `fail`을 명시해야 합니다.

## 동기화 데이터 감사

- 동기화 국가: 1개 (KR)
- admin feature: 6개
- populated place: 1개
- POI featureType: 0개
- 전체 feature: 13개 / 6 shards
- 전체 데이터 크기: 15,650 bytes
- catalog version: `dev-fixture-v1`
- source version: `development-fixture-2026-07-19`
- 범위 완료 여부: **미완료**
- 범위: Development fixture: Asia → Republic of Korea → Seoul/Gangwon subset

## 스크린샷

- `docs/screenshots/openfreemap-world-desktop.png`
- `docs/screenshots/openfreemap-world-mobile.png`
- `docs/screenshots/openfreemap-seoul-roads-water.png`
- `docs/screenshots/openfreemap-seoul-buildings-desktop.png`

### 개발 기능 검수 자료 — 실제 hosted 지도 품질 합격 증거 아님

`docs/screenshots/dev-test/`의 6개 화면은 `DEV TEST · MAP QUALITY NOT PASSED` 워터마크가 있는 desktop/mobile 기능 검수 자료입니다. 실제 basemap, terrain, 건물, 라벨 또는 행정 경계 품질의 합격 증거로 사용하지 않습니다.

## 콘솔 / WebGL 오류

- 없음

## 아직 검증하지 못한 범위

- 전 세계 국가·행정구역·도시·마을·POI catalog
- 기본 OpenFreeMap 이외의 hosted style, PMTiles archive, 별도 DEM provider
- DEM terrain (기본 스타일에는 지원 source 없음)
- 서울 25개 자치구 전체의 권위 있는 경계
- 운영 환경별 브라우저/GPU 조합과 장기 네트워크 안정성

개발용 `TestMapProvider`와 custom fixture는 기능 테스트 전용이며 품질 통과 증거가 아닙니다.
