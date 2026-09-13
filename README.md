# GeoType

GeoType은 MapLibre GL JS 지구본에서 세계·대륙·국가를 고르고, 도시·마을까지 이동하며 세션에 고정한 언어로 지명을 입력하는 클라이언트 전용 타이핑 게임입니다. UI 언어, 타이핑 언어, 정답 허용 범위는 서로 독립된 설정입니다.

> 일반 실행은 Natural Earth 1:10m의 production 국가 경계와 populated places 카탈로그를 사용합니다. 한국 일부만 담은 manifest/shard fixture는 명시적으로 켠 개발·테스트 환경에서만 사용합니다. 배경 지도는 환경 변수 없이 OpenFreeMap Liberty를 사용합니다. `?mapProvider=test`와 `?renderer=dom`은 결정적 자동화·fallback 확인용이며 실제 지도 품질 증거가 아닙니다.

## 현재 포함된 범위

일반 실행은 `public/geodata/world/` 아래의 국가 경계·도시/마을 point 파일과 index를 직접 읽습니다.

- 카탈로그 버전: `natural-earth-admin0-and-populated-places-5.1.1-5.1.2`
- Natural Earth Admin 0 – Countries 1:10m v5.1.1의 258개 feature와 7개 대륙
- ISO alpha-2/3가 있는 feature 238개, 특수·분쟁 단위 등 ISO가 없는 feature 20개
- Natural Earth 1:10m Populated Places의 7,293개 point: city 4,203개, town 3,090개, admin-0 수도 213개
- 219개 국가에 populated place가 있으며, 수도·도시·마을 후보는 국가 geometry와 별도로 부모 국가에 연결됨
- production provider가 합성한 세계 scope 1개와 7개 대륙을 포함해 런타임 feature 7,559개
- 국가·도시·마을의 한국어·영어 이름은 Natural Earth의 locale가 명시된 필드에서 가져옴
- 한국어 7,551개, 영어 7,551개, 로마자 7,551개가 현재 등록된 전체 production 지명 후보이며, 실제 출제 가능 수는 resolver 통계 명령이 기준임

Natural Earth의 de facto 경계 정책을 따르며 법적 승인이나 영유권 판단을 뜻하지 않습니다. populated places는 주요 수도·도시·마을을 고른 point layer이며 모든 정착지를 포함하는 census 목록이 아닙니다. 행정1·행정2 경계와 서울의 모든 지명은 production 범위가 아닙니다. 별도 `public/geodata/manifest.json`과 6개 shard의 13개 custom feature는 pipeline/UI 테스트용 KR 일부 fixture입니다. 데이터별 범위와 출처는 [DATA_SOURCES.md](./DATA_SOURCES.md), 이름 migration은 [LANGUAGE_DATA_MIGRATION.md](./LANGUAGE_DATA_MIGRATION.md)에 기록합니다.

## 실행

Node.js와 npm이 필요합니다.

```bash
npm install
npm run dev
```

`.env` 파일은 선택 사항입니다. 아무 환경 변수도 없으면 다음 기본값으로 즉시 실행됩니다.

```dotenv
VITE_MAP_PROVIDER=hosted
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_GEO_CATALOG_BASE_URL=/geodata
```

기본 실행에서 지도는 OpenFreeMap의 Liberty 스타일을 사용하고, 게임 데이터는 `/geodata/world/countries.geojson`, `/geodata/world/countries-index.json`, `/geodata/world/populated-places.json`, `/geodata/world/populated-places-index.json`에서 읽습니다. 지도 리소스를 네트워크에서 불러오지 못하면 오류 화면에서 재시도하거나 `?renderer=dom`으로 간단한 SVG 로컬 지도를 확인할 수 있습니다. DOM 지도는 국가·목표 점·방문 경로를 표시하지만 실제 벡터 타일의 도로·라벨·건물·지형 기능을 제공하지 않습니다.

오프라인에 가까운 결정적 UI 테스트가 필요하면 test map provider를 사용할 수 있습니다. 작은 geodata fixture까지 쓰려면 `fixture=1`을 별도로 지정해야 합니다.

```text
http://localhost:5173/?mapProvider=test&fixture=1
```

`?mapProvider=test`는 배경 지도만 test provider로 바꾸며, production geodata를 fixture로 암묵 교체하지 않습니다. fixture는 `?fixture=1`, test 환경, 또는 development에서 `VITE_GEO_FIXTURE_ENABLED=true`일 때만 선택됩니다. 화면에 `DEV TEST · MAP QUALITY NOT PASSED` 워터마크가 보이는 것이 정상이며, 이 모드로 배경 지도·지명 밀도·건물·지형 품질을 평가할 수 없습니다.

## 지도 공급자 설정

`MapProvider`는 배경 지도 스타일과 벡터 타일만 담당합니다. 게임 문제·이름·geometry는 별도의 `GeoCatalogProvider`가 담당하며, 배경 스타일의 label을 정답 목록으로 사용하지 않습니다.

| 변수 | 설명 | 필수 조건 |
|---|---|---|
| `VITE_MAP_PROVIDER` | `hosted`, `pmtiles`, `test` 중 하나 | 기본값은 `hosted` |
| `VITE_MAP_STYLE_URL` | MapLibre Style Specification JSON URL | 기본 OpenFreeMap Liberty; 설정값이 우선 |
| `VITE_MAP_ACCESS_TOKEN` | 호스팅 공급자 토큰 | 공급자가 요구할 때 |
| `VITE_MAP_TOKEN_PARAMETER` | URL에 붙일 토큰 쿼리 이름 | 기본 `access_token` |
| `VITE_MAP_ATTRIBUTION` | 실제 지도 원천에 맞는 attribution 문구 | `pmtiles` 필수; `hosted` 선택 |
| `VITE_PM_TILES_URL` | PMTiles archive URL | `pmtiles` |
| `VITE_GEO_CATALOG_BASE_URL` | production 국가·도시/마을 데이터 root. 앱이 `/world` 아래 네 파일을 읽음 | 기본 `/geodata` |
| `VITE_GEO_FIXTURE_ENABLED` | development에서 manifest/shard fixture 사용 | 기본 `false`; 정확히 `true`일 때만 |
| `VITE_GEO_FIXTURE_BASE_URL` | fixture manifest 디렉터리 | 기본 `/geodata` |
| `VITE_LEADERBOARD_MODE` | `local` 또는 HTTP 모드 | 기본 `local` |
| `VITE_API_BASE_URL` | HTTP 랭킹 API 기본 URL | HTTP 모드 |

### Hosted style

```dotenv
VITE_MAP_PROVIDER=hosted
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_MAP_ACCESS_TOKEN=
VITE_MAP_TOKEN_PARAMETER=access_token
```

환경 변수에 다른 `VITE_MAP_STYLE_URL`이 있으면 OpenFreeMap 기본값보다 우선합니다. 예를 들어 MapTiler를 사용하려면 아래처럼 로컬 환경 파일에만 키를 넣습니다.

```dotenv
VITE_MAP_PROVIDER=hosted
VITE_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v4/style.json?key=YOUR_API_KEY
```

실제 API 키는 저장소에 커밋하지 마세요. `HostedMapProvider`는 토큰이 있으면 설정된 스타일 URL과 같은 origin의 요청에만 지정된 쿼리 이름으로 붙이며, sprite나 glyph 등이 제3자 origin을 가리키면 토큰을 전달하지 않습니다. 지도 스타일 로드가 실제로 실패한 경우에만 실패한 리소스 종류와 상태 코드를 포함한 오류 화면과 재시도 버튼을 표시합니다.

스타일에 쓰인 벡터/래스터 데이터, glyph, sprite, DEM, 건물 source는 해당 공급자의 CORS, 라이선스, 사용량 정책을 따라야 합니다. 공급자 클래스의 capability 플래그가 실제 source 존재를 보장하지는 않습니다.

### PMTiles

```dotenv
VITE_MAP_PROVIDER=pmtiles
VITE_MAP_STYLE_URL=https://assets.example/geotype-pmtiles-style.json
VITE_PM_TILES_URL=https://assets.example/basemap.pmtiles
VITE_MAP_ATTRIBUTION=실제 archive 공급자가 요구하는 정확한 attribution 문구
```

PMTiles 스타일의 해당 source URL은 `pmtiles://geotype`을 사용해야 합니다. 공급자가 이를 `VITE_PM_TILES_URL` archive로 연결하고 MapLibre protocol을 등록합니다. GeoType은 PMTiles archive가 OpenStreetMap에서 왔다고 추측하지 않으며, `VITE_MAP_ATTRIBUTION`이 비어 있으면 공급자 설정 화면에서 멈춥니다. 이 저장소에는 PMTiles archive, glyph, sprite, DEM 또는 건물 데이터가 포함되어 있지 않습니다.

### Terrain과 3D buildings

OpenFreeMap Liberty Style JSON에는 `openmaptiles` vector source의 `building` source-layer를 사용하는 `building-3d` fill-extrusion 레이어가 이미 있습니다. 앱은 로드된 스타일에서 이 정보를 읽어 zoom 14 이상에서 활성화하며, 높이는 실제 `render_height`만 사용합니다. source/source-layer를 추측하거나 가짜 높이를 만들지 않습니다.

기본 스타일에는 `raster-dem` source가 없으므로 `terrainSupported=false`이고 terrain은 비활성입니다. 아래 환경 변수는 추후 실제 DEM 공급자 또는 별도 스타일을 연결하는 인터페이스입니다.

| 변수 | 설명 |
|---|---|
| `VITE_MAP_TERRAIN_ENABLED` | DEM terrain 요청 여부. 정확히 `true`일 때만 켬 |
| `VITE_MAP_TERRAIN_SOURCE_ID` | 스타일에 이미 있거나 새로 추가할 `raster-dem` source ID |
| `VITE_MAP_TERRAIN_SOURCE_URL` | 새 DEM source의 TileJSON URL. `TILES`와 동시 사용 불가 |
| `VITE_MAP_TERRAIN_TILES` | JSON 문자열 배열 또는 쉼표 구분 DEM tile template |
| `VITE_MAP_TERRAIN_TILE_SIZE` | `256` 또는 `512` |
| `VITE_MAP_TERRAIN_EXAGGERATION` | `0.1`~`10` 범위의 지형 배율 |
| `VITE_MAP_BUILDINGS_ENABLED` | 3D building extrusion 요청 여부. 정확히 `true`일 때만 켬 |
| `VITE_MAP_BUILDINGS_SOURCE_ID` | 스타일에 존재하는 vector source ID |
| `VITE_MAP_BUILDINGS_SOURCE_LAYER` | 건물 geometry가 있는 source-layer |
| `VITE_MAP_BUILDINGS_LAYER_ID` | 추가할 extrusion layer ID. 기본 `geotype-3d-buildings` |
| `VITE_MAP_BUILDINGS_MIN_ZOOM` | extrusion 최소 zoom. 기본 `14` |

```dotenv
VITE_MAP_TERRAIN_ENABLED=true
VITE_MAP_TERRAIN_SOURCE_ID=terrain-dem
VITE_MAP_TERRAIN_SOURCE_URL=https://provider.example/dem/tilejson.json
VITE_MAP_TERRAIN_TILE_SIZE=512
VITE_MAP_TERRAIN_EXAGGERATION=1.15

VITE_MAP_BUILDINGS_ENABLED=true
VITE_MAP_BUILDINGS_SOURCE_ID=openmaptiles
VITE_MAP_BUILDINGS_SOURCE_LAYER=building
VITE_MAP_BUILDINGS_LAYER_ID=geotype-3d-buildings
VITE_MAP_BUILDINGS_MIN_ZOOM=14
```

terrain source가 스타일에 이미 있으면 `SOURCE_URL`과 `TILES`를 모두 비우고 source ID만 지정합니다. 새 source를 추가할 때는 `SOURCE_URL` 또는 `TILES` 중 하나만 사용합니다. 건물 source와 source-layer는 반드시 로드된 스타일에서 확인한 실제 값이어야 합니다. 설정 파서는 요청/유효 설정을 구분하고, renderer는 스타일 제공 레이어·provider 지원·MapLibre 활성화 결과를 따로 기록합니다.

### Test provider

```dotenv
VITE_MAP_PROVIDER=test
```

또는 주소에 `?mapProvider=test`를 붙입니다. `TestMapProvider`는 오프라인 단색 스타일을 위한 결정적 개발 도구입니다. geodata fixture도 필요하면 `?mapProvider=test&fixture=1`을 사용합니다. `visualQualityEligible`은 항상 `false`이고, 실제 품질 게이트를 통과할 수 없습니다.

## UI 언어와 타이핑 언어

언어 설정은 다음 세 축을 분리합니다. 기본값은 `uiLocale=ko`, `typingLanguage=ko`, `answerPolicy=strict`이며 `geotype.language-settings.v1`에 저장합니다.

```ts
type UiLocale = 'ko' | 'en';

type TypingLanguage =
  | 'ko'
  | 'en'
  | 'native'
  | 'romanized'
  | 'ja-kanji'
  | 'ja-reading';

type AnswerPolicy = 'strict' | 'casual';
```

- `UiLocale`는 메뉴의 언어명과 지역 표시·정렬에 쓰는 UI 선호입니다. 정답 문자를 바꾸지 않습니다.
- `TypingLanguage`는 문제 표기, 힌트, 입력 판정, 지도 판정 라벨에 쓰는 실제 답의 언어/문자 모드입니다.
- `AnswerPolicy`는 선택한 타이핑 언어 외의 등록 이름까지 허용할지 정합니다.

### 지원 모드와 범위

| 모드 | 목표 선택 | 현재 노출 범위 |
|---|---|---|
| `ko` | 등록된 한국어 localized/official/short 이름 | 세계·대륙·국가·도시·마을 |
| `en` | 등록된 영어 이름, 없으면 등록된 romanized 이름 | 세계·대륙·국가·도시·마을 |
| `native` | 국가 프로필의 검증된 기본·선호 locale 이름 | 단일 국가 범위; 세계·대륙에서는 비활성 |
| `romanized` | 등록된 romanized 이름, 없으면 문서화된 영어/Latin fallback | 세계·대륙·국가·도시·마을 |
| `ja-kanji` | 일본어 `Hani`/`Jpan`의 official/short 이름 | 일본 국가 범위만 |
| `ja-reading` | 일본어 `reading`의 `Hira`/`Kana` 이름 | 일본 국가 범위만 |

세계·대륙의 `native` 모드는 한 세션에서 여러 문자 입력기를 반복 전환하게 되므로 선택할 수 없습니다. 일본은 모호한 `native` 한 항목 대신 한자와 읽기 모드를 분리합니다. 다른 국가에서는 일본어 모드를 숨기며, 검증된 국가 언어 프로필이 없는 국가는 `native`를 비활성화하고 이유를 표시합니다.

언어별 답을 만들 수 없는 feature는 문제 수를 자르거나 섞기 **전에** 제외합니다. 메뉴에는 전체 후보, 입력 가능 수, 제외 수가 표시되고 입력 가능 수가 0이면 시작할 수 없습니다. 앱은 빈 값을 영어나 지도 label로 몰래 대체하지 않습니다.

### strict와 casual

- `strict`는 선택한 모드의 locale/script와 `localized`, `official`, `short` 등 모드별 허용 kind만 인정합니다. 일본어 읽기는 등록된 `reading`만 인정합니다.
- `casual`은 해당 feature에 출처와 locale가 함께 등록된 non-historic 이름(`localized`, `official`, `short`, `reading`, `romanized`, `alternate`)을 폭넓게 인정합니다.
- `historic`은 기본 casual에도 포함하지 않습니다. 자동 번역, 자동 음역, 중국어 간체/번체 변환, 일본어 한자→읽기 생성은 하지 않습니다.

공통 비교는 Unicode NFC, zero-width 문자 제거, 앞뒤/연속 공백 정리, 대소문자 무시를 적용합니다. `romanized`는 기본적으로 Latin 발음 구별 기호를 무시하고, `ja-reading`은 비교할 때 가타카나를 히라가나로 접습니다. 이는 등록된 답 사이의 비교 규칙일 뿐 새 이름을 생성하는 transliteration이 아닙니다.

### 세션 고정

게임 시작 시 각 feature의 `ResolvedAnswer`를 한 번 계산해 세션에 저장합니다. 세션에는 `LanguageSettings`, feature별 목표/허용 답, 단일 `answerLocale`이 가능한 경우 그 locale, `languageDataVersion`이 들어갑니다. 게임 중 메뉴 설정이나 저장소 값이 바뀌어도 현재 문제의 목표, 힌트, IME 판정, 지도 공개 이름, 랭킹 partition은 바뀌지 않습니다.

한글과 일본어 IME는 `compositionstart`/`compositionend`를 인지합니다. 조합 중 Enter와 중간 문자열 판정을 무시하고 조합 종료 후에만 정규화된 답을 검사합니다. 붙여넣기는 막습니다.

## 이름 데이터 모델

정답 resolver는 `GeoFeature.names`만 읽습니다. 기존 `name`, `localizedNames`, `aliases`는 검색·표시 호환 필드이며 런타임에서 locale를 추측해 정답으로 승격하지 않습니다.

```ts
type PlaceName = {
  locale: string;
  script?: string;
  value: string;
  kind: 'localized' | 'official' | 'short' | 'reading' |
    'romanized' | 'historic' | 'alternate';
  isPreferred: boolean;
};
```

새 이름을 추가할 때는 원천에 명시된 값·locale·script·kind만 기록하고 `PlaceNamesSchema` 검증을 통과시켜야 합니다. `name`이나 locale가 섞인 `aliases`를 보고 언어를 추측하지 마세요. 기존 데이터 migration은 locale가 명시된 `localizedNames`, `nameKo`, `nameEn`만 `PlaceName`으로 옮기며, 출처가 불명확한 값은 unresolved 보고에 남깁니다. 데이터 출처, revision, 라이선스와 수동 override 이유를 [DATA_SOURCES.md](./DATA_SOURCES.md), [ATTRIBUTIONS.md](./ATTRIBUTIONS.md), [LANGUAGE_DATA_MIGRATION.md](./LANGUAGE_DATA_MIGRATION.md)에 함께 기록합니다.

현재 언어 데이터 버전은 `place-names-v1`입니다. 실제 출제 가능 수는 다음 명령으로 provider output과 resolver를 통해 다시 계산합니다.

```bash
npm run geodata:language-stats
```

현재 production 후보는 국가 258개와 city/town 7,293개로 총 7,551개입니다. `npm run geodata:language-stats`를 실행하면 provider output과 resolver를 다시 읽어 언어별 전체·출제 가능·제외 수를 출력합니다. 현재 번들 기준으로 한국어·영어·로마자는 7,551개, 현지어는 1,622개, 일본어 한자는 70개, 일본어 읽기는 1개가 출제 가능합니다. 데이터가 바뀌면 문서보다 명령 출력을 우선합니다.

## 플레이 흐름

1. MapLibre globe에서 국가를 클릭하거나 세계·대륙 버튼/국가 검색으로 범위를 선택합니다.
2. `세계 10개국`, `도시 탐험`, `세계 수도` 빠른 시작 preset을 사용하거나 지명 종류·문제 수를 직접 고릅니다.
3. UI 언어와 타이핑 언어, strict/casual, 문제 수, 난이도를 선택합니다.
4. `GameScope`가 선택 범위의 국가·city·town 후보 ID를 만들고 언어 resolver가 답이 있는 feature만 먼저 남깁니다.
5. 남은 후보를 seed로 섞어 요청한 문제 수만큼 자르고 `ResolvedAnswer`와 언어 데이터 버전을 세션에 고정합니다.
6. 문제마다 geometry와 bbox에 맞춰 카메라를 이동합니다. 지도 이동 중에는 타이머가 흐르지 않습니다.
7. 지도 `idle`, 목표 source/layer 준비, 목표 geometry의 실제 렌더, 입력창 focus가 모두 확인된 뒤에만 타이머가 시작됩니다. 실행 token으로 이전 문제의 readiness callback을 무시합니다.
8. 문제 중에는 목표 이름을 숨기고, 판정 단계에서 세션에 저장된 타이핑 언어의 이름을 공개합니다. `힌트 한 글자`는 150점을 차감하고, `정답 보고 넘기기`는 오답으로 기록합니다.
9. 일시 정지·탭 전환 중에는 타이머와 지도 이동을 멈추며, 복귀 뒤 남은 시간으로 재개합니다. 결과의 총 플레이 시간은 정지 시간을 제외합니다.
10. 결과에서는 방문한 stop과 route, 문제별 정답·판정·남은 시간·응답 시간·힌트 수를 다시 확인할 수 있습니다.
11. 결과는 scope, 난이도, 지리/언어 데이터 버전, 타이핑 언어, 정답 정책별 랭킹 partition에 저장됩니다.

### 조작

- 지명을 입력하면 등록된 답과 일치하는 순간 자동으로 정답 처리됩니다.
- 틀린 입력을 확정하려면 `Enter`를 누릅니다. 한글·일본어 IME 조합 중 `Enter`는 무시합니다.
- `힌트 한 글자`는 다음 글자를 공개하고 150점을 차감합니다. 자동 힌트가 없는 Expert에서도 수동 힌트는 선택할 수 있습니다.
- `정답 보고 넘기기`는 현재 문제를 오답으로 기록하고 정답을 잠시 보여준 뒤 다음 위치로 이동합니다.
- `Esc` 또는 일시 정지 버튼으로 멈출 수 있습니다. 다른 탭으로 이동해도 타이머는 자동으로 멈춥니다.

## 동적 GameScope

고정된 주제 목록은 없습니다. `src/game/scope/gameScope.ts`의 `GameScope`가 매 세션의 출제 범위를 표현합니다.

```ts
type GameScope = {
  rootFeatureId: string;
  includedFeatureTypes: GeoFeatureType[];
  includeDescendants: boolean;
  questionCount: number | 'all';
  seed?: string;
  minPopulation?: number;
  minImportance?: number;
  includeNaturalFeatures: boolean;
  includeLandmarks: boolean;
};
```

- `includeDescendants=false`이면 root 자체만 검사합니다.
- `minPopulation`은 국가·행정구역·도시·마을·동네 계열에 적용됩니다.
- `minImportance`는 모든 후보에 적용됩니다.
- 자연지형은 `mountain`, `river`, `lake`, 랜드마크 계열은 `station`, `landmark`, `poi`입니다. production populated places는 현재 `city`와 `town` point입니다.
- 동일 ID는 한 번만 남기고, seed가 있으면 결정적으로 섞은 뒤 문제 수만큼 자릅니다.
- 세션 ID는 root, type, 필터 조합으로 생성되며 `catalogVersion`과 함께 랭킹을 분리합니다.

범위 필터 뒤에도 선택한 타이핑 언어의 검증된 이름이 없는 feature는 제외됩니다. 최종 출제 가능 후보가 0개이면 UI가 이유와 대안을 보여주고 시작 버튼을 비활성화합니다.

## 지도 렌더링 구조

`src/map/`은 MapLibre를 다음 역할로 분리합니다.

- `providers.ts`: hosted, PMTiles, test 공급자 해석과 설정 오류 처리
- `MapLibreRenderer.tsx`: globe projection, catalog/target/hover layer, 선택 이벤트, camera, readiness
- `layers.ts`: Point, LineString, Polygon/MultiPolygon용 GeoJSON source/layer와 목표 이름 숨김 정책
- `framing.ts`: geometry, bbox, viewport, HUD padding을 반영한 camera plan
- `readiness.ts`: map idle, source, layer가 모두 준비된 시점 판정
- `pmtiles.ts`: PMTiles protocol 수명 관리
- `SimpleMapRenderer.tsx`: `?renderer=dom` 또는 3D 지도 실패 시 사용하는 간단한 SVG 지도. 국가 경계, 목표 점, 방문 stop·route를 표시하며 도로·라벨·건물·지형은 지원하지 않음
- `geodata/providers.ts`: 게임 문제·이름·geometry를 공급하는 독립 `GeoCatalogProvider`

탐색 중에는 drag, zoom, hover, click이 가능합니다. 클릭 결과는 `SelectionStore`와 breadcrumb에 동기화됩니다. 질문에는 전체 이름을 표시하지 않으며, 판정 시 target layer가 reveal 모드로 바뀝니다. 게임과 결과 화면에는 방문 stop과 이동 route가 남습니다.

Map provider의 terrain/building capability 선언만으로 기능이 켜지지는 않습니다. 위 환경 변수의 요청과 source 설정이 유효하고, provider가 지원하며, MapLibre 적용까지 성공해야 활성 상태가 됩니다. 기본 OpenFreeMap은 로드된 Style JSON에서 확인한 `building-3d`를 활성화하지만, 사용할 수 있는 DEM source가 없으므로 terrain을 활성화하지 않습니다.

## 지리 데이터 구조

정규화된 `GeoFeature`는 단일 위경도 점 대신 실제 geometry를 보관합니다.

```ts
type GeoFeature = {
  id: string;
  source: 'geonames' | 'natural-earth' | 'overture' | 'osm' | 'custom';
  sourceVersion: string;
  featureType: GeoFeatureType;
  name: string;
  localizedNames: Record<string, string>;
  aliases: string[];
  names?: PlaceName[];
  geometry: Point | LineString | MultiLineString | Polygon | MultiPolygon;
  centroid: [longitude: number, latitude: number];
  bbox: [west: number, south: number, east: number, north: number];
  parentIds: string[];
  countryCode?: string;
  adminCodes?: string[];
  population?: number;
  importance?: number;
  recommendedMinZoom: number;
  recommendedMaxZoom: number;
};
```

계층은 `parentIds`로 만듭니다. production provider는 다음 구조를 메모리에서 구성합니다.

```text
World (synthetic scope)
├─ Asia
│  ├─ Republic of Korea (KR / KOR)
│  └─ Japan (JP / JPN)
├─ Europe
└─ … 7 continents / 258 countries / 7,293 populated places
```

국가 아래의 production feature는 populated places point이며 행정1·행정2 경계가 아닙니다. `?fixture=1`에서만 별도의 Asia → KR → 서울/강원 일부 custom 계층(행정구역·역·하천·도로·랜드마크)을 사용합니다.

### Production files와 fixture shard

일반 실행의 `WorldCountryGeoCatalogProvider`는 `/geodata/world/countries.geojson`, `countries-index.json`, `populated-places.json`, `populated-places-index.json`을 직접 읽고, 작은 manifest로 fallback하지 않습니다. 두 index에 source/version/hash/byte 수, 국가·대륙·populated place 수, 국가 ID와 ISO code가 기록됩니다. 국가 경계와 도시·마을 point는 서로 다른 Natural Earth release를 사용하지만 provider가 하나의 계층 catalog로 합칩니다.

개발 fixture의 manifest는 catalog/source 버전, declared scope, completeness, shard 경로, byte size, feature 수, SHA-256 checksum, feature type, country code, 상위 shard dependency를 기록합니다. fixture provider는 처음에 navigation shard를 읽고 선택에 따라 dependency closure를 병합합니다.

런타임 데이터는 Zod 스키마로 검증합니다. 디스크 검증은 다음 오류도 확인합니다.

- 잘못된 geometry, 좌표, bbox 또는 centroid
- 중복 feature ID
- 존재하지 않는 parent, 자기 참조, 계층 cycle
- manifest byte size, checksum, feature count 불일치
- shard type, country, source version 메타데이터 불일치

### 브라우저 캐시

fixture shard는 IndexedDB `geotype-geodata`에 payload와 checksum을 저장합니다. `catalogVersion`이 바뀌면 기존 shard store를 비웁니다. cache hit도 checksum과 스키마를 다시 확인하며, 손상된 레코드는 삭제하고 원본 shard를 다시 요청합니다. IndexedDB가 없는 환경에서는 메모리 cache로 내려갑니다. production 국가·populated places 파일은 이 manifest/shard cache 경로와 별개입니다.

## 데이터 갱신과 adapter 한계

```bash
npm run geodata:import:countries
npm run geodata:validate
npm run geodata:stats
npm run geodata:language-stats
```

`geodata:import:countries`는 고정된 Natural Earth archive checksum과 source metadata를 기준으로 production 국가 파일을 생성하는 importer입니다. 원천 버전, 다운로드 URL, Public Domain 표기와 변환 규칙은 데이터 문서에 기록되어 있습니다. `geodata:validate`는 production 국가 파일과 별도 fixture를 모두 검증합니다.

`geodata:import:places`는 고정된 Natural Earth 1:10m Populated Places archive에서 source가 분류한 수도·도시·마을 point를 추출해 `populated-places.json`과 index를 생성합니다. 현재 7,293개 point 중 city 4,203개와 town 3,090개를 보존하며, 수도 flag는 원천의 `ADM0CAP`/`CAPALT`가 명시한 경우에만 기록합니다. 이름은 `NAME_KO`, `NAME_EN`, `NAMEASCII`처럼 원천에 명시된 필드만 옮깁니다. 모든 정착지를 보장하는 importer가 아닙니다.

`geodata:sync -- --scope=world --countries=KR`는 외부 서비스를 동기화하지 않습니다. 13개 custom development fixture를 결정적으로 다시 만들고 manifest/checksum을 재생성하는 전용 명령입니다. KR 이외 국가는 source adapter가 없으므로 명시적으로 실패합니다. 이 명령의 `world`는 전 세계가 동기화되었다는 뜻이 아닙니다.

실제 catalog를 추가하려면 별도의 빌드 단계에서 라이선스가 확인된 원천을 읽어 `GeoFeatureCollection`으로 정규화하고 안정적 ID·`PlaceName[]`·부모 계층·geometry·centroid·bbox·source version을 채워야 합니다. 원천별 attribution과 라이선스를 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)와 [DATA_SOURCES.md](./DATA_SOURCES.md)에 기록하고 `geodata:validate`와 `geodata:language-stats`를 통과시키세요. 앱 실행 중 공개 geocoder나 번역 서비스를 호출해 정답을 만드는 구조는 권장하지 않습니다. 도시·마을 point를 늘려도 행정 경계나 서울 전체 지명이 자동으로 생기지 않습니다.

원격 production catalog를 사용할 때 `VITE_GEO_CATALOG_BASE_URL`은 `world/countries.geojson`, `world/countries-index.json`, `world/populated-places.json`, `world/populated-places-index.json`의 상위 root를 가리킵니다. 값이 이미 `/world`로 끝나면 다시 붙이지 않습니다. 네 파일을 함께 제공하지 않으면 도시·마을 후보를 포함한 기본 catalog를 만들 수 없습니다. fixture manifest를 원격으로 제공할 때는 별도 `VITE_GEO_FIXTURE_BASE_URL`을 사용하고 shard 경로와 CORS/cache 정책을 함께 맞춥니다.

## 랭킹

기본 저장소는 브라우저 `localStorage`의 `geotype:leaderboard:v2`입니다. 저장 데이터는 Zod로 검증하고 손상된 레코드가 앱을 중단시키지 않도록 복구합니다. 브라우저가 storage getter를 제한하거나 저장이 실패해도 게임 화면은 계속 열리며, 랭킹 영역은 오류와 다시 시도 버튼을 표시합니다. 순위는 다음 값이 모두 같은 기록끼리만 비교합니다.

- 동적 scope ID(`topicId`), 난이도, 지리 `dataVersion`
- `typingLanguage`, `answerPolicy`, `languageDataVersion`
- query가 단일 `answerLocale`을 지정한 경우 그 locale

따라서 한국어 strict 기록과 영어/일본어/casual 기록이 섞이지 않습니다. 정렬은 점수 내림차순, 정확도 내림차순, 플레이 시간 오름차순이며 최대 20개입니다. 이전 `geotype:leaderboard:v1` 기록은 읽을 때 `typingLanguage=ko`, `answerPolicy=strict`, `languageDataVersion=legacy-v1` partition으로 명시적으로 옮기고 v2 저장에 성공한 뒤 이전 key를 제거합니다. 새 `place-names-v1` 기록과 자동으로 합치지 않습니다.

HTTP 모드의 계약은 다음과 같습니다.

```http
GET /leaderboard?topicId=<dynamic-scope-id>&difficulty=<easy|normal|hard|expert>&dataVersion=<catalog-version>&typingLanguage=<mode>&answerPolicy=<strict|casual>&languageDataVersion=<version>&answerLocale=<optional-locale>
Accept: application/json
```

```json
{
  "entries": []
}
```

```http
POST /leaderboard
Content-Type: application/json
```

POST body는 `LeaderboardEntry` 전체입니다. 기존 점수 필드에 `typingLanguage`, `answerPolicy`, `languageDataVersion`과 선택적 `answerLocale`이 반드시 함께 전달됩니다. 서버는 같은 partition 규칙을 적용하고 유효한 JSON과 2xx 응답을 반환해야 하며, GET 응답은 `{ "entries": LeaderboardEntry[] }` 형태여야 합니다. 실제 서버 구현은 이 저장소에 포함되어 있지 않습니다.

## 품질 게이트

```bash
npm run map:quality
```

이 명령은 실제 공급자 설정으로 desktop/mobile 및 대표 위치를 확인하고 `docs/screenshots/map-quality/`와 품질 보고서를 만드는 용도입니다. 실제 style/tile 공급자 없이 test renderer로 얻은 화면은 기능 증거일 수는 있어도 지도 품질 합격으로 인정하지 않습니다.

단일 승인 플래그는 허용하지 않습니다. 특히 기존 `MAP_QUALITY_APPROVED=true`는 아무 효과가 없습니다. 자동 검사(WebGL, style/tile 응답, 콘솔 오류, 요청 capability 활성화)가 성공한 뒤에도 아래 모든 항목을 화면으로 검토해 각각 `pass` 또는 `fail`로 기록해야 합니다.

| 검토 결과 변수 | 기준 |
|---|---|
| `MAP_QUALITY_WORLD_GLOBE_RESULT` | 세계 구면 표현과 전 지구 구도 |
| `MAP_QUALITY_KOREA_BOUNDARY_RESULT` | 대한민국 및 행정 경계 가독성 |
| `MAP_QUALITY_SEOUL_DETAIL_RESULT` | 서울 상세 지형·도로·수계 밀도 |
| `MAP_QUALITY_LABELS_RESULT` | 한글 라벨과 목표명 숨김 |
| `MAP_QUALITY_TARGET_VISIBILITY_RESULT` | 목표 geometry 대비와 판정 공개 |
| `MAP_QUALITY_CAMERA_RESULT` | 범위별 framing과 전환 |
| `MAP_QUALITY_DESKTOP_RESULT` | 1440×900 HUD와 지도 구성 |
| `MAP_QUALITY_MOBILE_RESULT` | 390×844 HUD와 지도 구성 |
| `MAP_QUALITY_TERRAIN_RESULT` | terrain을 요청했을 때만 필수 |
| `MAP_QUALITY_BUILDINGS_RESULT` | 3D buildings를 요청했을 때만 필수 |

어느 항목이든 `fail`이면 **NOT PASSED**, 빠진 항목이 있으면 **REVIEW REQUIRED**, 모든 적용 항목이 `pass`일 때만 **PASSED**입니다. 보고서는 capability별 요청 여부, 설정 유효성, provider 지원, 실제 MapLibre 활성화를 따로 표시합니다.

품질 게이트는 실행 시점의 실제 style/source/tile 응답과 브라우저 상태를 검사합니다. 결과는 `docs/map-quality-report.md`에 기록되고, 화면은 `docs/screenshots/map-quality/`에 저장됩니다. 별도 hosted style, PMTiles, DEM 공급자는 각각의 환경 설정으로 다시 검수해야 하며, 기존 스크린샷이나 test renderer 결과를 현재 공급자의 증거로 간주하지 않습니다.

기본 OpenFreeMap 검수용 참고 화면은 [세계 지도 desktop](./docs/screenshots/openfreemap-world-desktop.png), [세계 지도 mobile](./docs/screenshots/openfreemap-world-mobile.png), [서울 도로·한강](./docs/screenshots/openfreemap-seoul-roads-water.png), [서울 3D 건물](./docs/screenshots/openfreemap-seoul-buildings-desktop.png)입니다.

## 명령

| 명령 | 역할 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | TypeScript 검사 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 검사 |
| `npm run test` | Vitest 단위/컴포넌트 테스트 |
| `npm run test:watch` | Vitest 감시 모드 |
| `npm run e2e` | Playwright 브라우저 흐름 |
| `npm run geodata:import:countries` | Natural Earth production 국가 파일 import |
| `npm run geodata:import:places` | Natural Earth production city/town point 파일 import |
| `npm run geodata:sync` | 개발 fixture 재생성 |
| `npm run geodata:validate` | production 국가 파일과 fixture schema/geometry/hierarchy 검증 |
| `npm run geodata:stats` | 실제 선언 범위와 수량 출력 |
| `npm run geodata:language-stats` | 언어 모드별 실제 출제 가능/제외 수 출력 |
| `npm run map:quality` | 실제 provider 지도 품질 검수 |
| `npm run check` | lint, typecheck, test, geodata validation, build 순차 실행 |

## 프로젝트 구성

```text
src/
  app/                 provider와 저장소 조립
  components/browse/   지도 선택, 빠른 시작 preset, GameScope UI, 설정 안내
  components/game/     IME 입력, 자동·수동 힌트, 타이머 HUD, 건너뛰기
  components/result/   결과, 문제별 복습, 방문 route와 랭킹
  geodata/             schema, geometry, hierarchy, loader, IndexedDB cache
  game/scope/          동적 후보 필터링과 seeded selection
  game/store/          phase와 단일 판정 보장
  language/            PlaceName schema, resolver, 정규화, eligibility, 설정
  leaderboard/         언어별 partition과 local/HTTP 저장소
  map/                 MapLibre renderer, provider, layers, camera, readiness
  selection/           지도/목록 선택 상태와 국가별 type label
scripts/geodata/       production importer, fixture 생성, 검증, 언어 통계
public/geodata/world/  production 국가·도시·마을 GeoJSON과 index
public/geodata/        명시적으로 선택하는 fixture manifest와 6개 shard
```

## 테스트 범위

Vitest는 `PlaceName` schema/migration, 언어별 target 우선순위, strict/casual 허용 답, Unicode·Latin·일본어 정규화, 세계 native 차단, eligibility 선필터, 언어 설정 저장, 한글/일본어 IME, 세션 고정, 언어별 랭킹 partition/v1 migration을 검사합니다. 여기에 geometry/bbox, hierarchy/cycle, fixture shard cache 복구, Map/Geo Catalog provider 분리, camera/layer/readiness, SelectionStore, GameScope, 타이머, 점수, phase, 수동 힌트·건너뛰기, 결과 복습, 랭킹 재시도 테스트가 포함됩니다. 실행 시 실제 통과 수는 `npm run test` 출력으로 확인합니다.

Playwright는 간단 지도에서 국가 검색·선택, 도시 탐험 프리셋, 한국어·영어·일본어 한자/읽기 입력, strict/casual 판정, 힌트·정답 공개 건너뛰기, 일시 정지, 문제별 복습과 로컬 랭킹 새로고침 유지를 desktop/mobile에서 확인합니다. OpenFreeMap 스타일 HTTP 503 오류에서 간단 지도로 복구하는 흐름도 검사합니다. 실제 hosted 지도 검수는 `scripts/inspect-experience.mjs`와 `docs/experience-review.md`에 별도로 기록합니다. 브라우저별 실제 통과 수는 `npm run e2e` 출력으로 확인합니다.

E2E는 4173 포트에 전용 Vite 서버를 시작합니다. 해당 포트에 다른 앱이 실행 중이면 그 앱을 재사용하거나 종료하지 않고 테스트 시작을 중단합니다.

## 현재 한계

- production 범위는 Natural Earth Admin-0 국가 258개와 Natural Earth Populated Places city/town point 7,293개입니다. 행정1·행정2 경계, 도로·역·랜드마크 geometry, 서울의 모든 지명은 아직 없습니다. 배경 스타일에 보이는 label을 정답으로 쓰지 않습니다.
- populated places는 4,203 city와 3,090 town, 213개 수도 flag를 포함하지만, 모든 정착지를 담은 목록이 아닙니다. 수도 213개는 point feature의 source flag 수이며 국가 수와 같은 의미가 아닙니다.
- Natural Earth geometry는 축척 1:10m의 de facto 경계로 법적 경계·영유권 판단의 근거가 아닙니다. KR 일부 fixture geometry는 pipeline/UI 검사용 간소화 custom 데이터입니다.
- 언어 통계는 국가뿐 아니라 city/town 후보까지 포함해 `npm run geodata:language-stats`로 계산합니다. 현재 번들의 한국어·영어·로마자 출제 가능 수는 7,551개, 현지어는 1,622개, 일본어 한자는 70개, 일본어 읽기는 1개입니다. 누락 이름을 자동 번역하거나 추측하지 않습니다.
- GeoNames, Overture, OpenStreetMap enum은 향후 adapter를 위한 모델 값일 뿐 현재 importer가 구현된 것이 아닙니다.
- 기본 vector style, tiles, glyph, sprite는 OpenFreeMap에서 네트워크로 불러오며 번들하지 않습니다. 오프라인에서는 test provider만 사용할 수 있습니다.
- 기본 OpenFreeMap의 3D buildings는 검증했지만 terrain은 지원할 DEM source가 없습니다. 별도 DEM 및 PMTiles archive는 제공하거나 검증하지 않습니다.
- HTTP leaderboard 서버는 제공하지 않습니다.
- test provider와 그 스크린샷은 실제 지도 품질 합격 조건이 아닙니다. 기본 OpenFreeMap hosted smoke 검수와 구분합니다.

의존성과 데이터 attribution은 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md), 데이터별 근거와 교체 규칙은 [DATA_SOURCES.md](./DATA_SOURCES.md)를 확인하세요.
