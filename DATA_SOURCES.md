# GeoType 데이터 출처와 범위

이 문서는 앱에서 사용하는 **게임용 지리 카탈로그**를 설명합니다. 배경 지도 style/tile의 출처는 별도이며 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)의 공급자 책임 항목을 따릅니다.

## Production 세계 국가 경계

일반 실행의 국가 선택 경계는 Natural Earth의 **Admin 0 – Countries, 1:10m, version 5.1.1**을 전처리한 로컬 파일입니다.

| 항목 | 실제 값 |
|---|---|
| 공식 데이터 페이지 | <https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/> |
| 공식 원본 archive | <https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_countries.zip> |
| 원본 내 version | `5.1.1` (`ne_10m_admin_0_countries.VERSION.txt`로 확인) |
| 축척 | `1:10m` |
| 원본 archive SHA-256 | `ce1ac7036499a0edd641fbc093cd209a98f96a49d2eca8480aaacad35138a7f6` |
| 라이선스 | Public domain |
| 전처리 결과 | `public/geodata/world/countries.geojson` |
| 검색/대륙 index | `public/geodata/world/countries-index.json` |
| polygon feature | 258개 |
| 대륙 그룹 | 7개 |
| ISO alpha-2 / alpha-3 보유 | 각각 238개 |

Natural Earth 공식 설명은 이 layer를 258개 country feature로 정의합니다. 이 숫자를 국제적으로 승인된 주권국가의 수로 해석하면 안 됩니다. dataset은 dependency와 특수·분쟁 지역을 포함하며 **de facto** 경계 정책을 따릅니다. 20개 특수·분쟁 feature에는 해당 feature 자체에 부여된 ISO alpha-2 또는 alpha-3가 없습니다. GeoType은 이 경우 `null`을 저장하며 ISO처럼 보이는 임의 코드를 만들지 않습니다. 모든 feature에는 Natural Earth의 고유 `ADM0_A3` 값이 있으므로 `natural-earth:country:{ADM0_A3}` 형식의 안정적인 hit-test ID를 사용합니다.

## Production 도시·수도 데이터

국가를 선택했을 때 국가 이름 하나만 반복하지 않도록, production provider는 Natural Earth **Populated Places, 1:10m, version 5.1.2**의 point layer도 함께 읽습니다. 원본에는 admin-0/admin-1 수도, 주요 도시, town이 포함되어 있으며 GeoType은 다음 공식 분류만 보존했습니다.

- 원본 7,342개 point 중 `Populated place`, `Admin-0 capital`, `Admin-0 capital alt`, `Admin-0 region capital`, `Admin-1 capital`, `Admin-1 region capital` 7,293개
- 4,203개 `city`, 3,090개 `town`, 213개 admin-0 수도 또는 수도 대체 표기
- 219개 국가에 연결되며, 모든 point는 `natural-earth:country:{ADM0_A3}` parent와 country/continent metadata를 가짐
- 출처에 `NAME_KO`, `NAME_EN`, `NAMEASCII`가 명시된 7,293개만 등록. 한국어는 `NAME_KO`를 그대로 사용하며 번역·추측을 하지 않음
- `NAME_JA`는 일본어 표기 필드이므로 읽기(`ja-reading`)로 변환하지 않음. 읽기 데이터가 없는 경우 해당 모드는 출제 후보에서 제외

산출물은 [populated-places.json](./public/geodata/world/populated-places.json)과 [populated-places-index.json](./public/geodata/world/populated-places-index.json)입니다. 각 feature에는 Natural Earth source version, point geometry, population(원본 `POP_MAX`), capital flag, 그리고 언어가 명시된 `PlaceName[]`이 들어 있습니다. `GeoFeature`의 `capital`은 원본 `ADM0CAP` 또는 `CAPALT`가 수도로 표시한 경우에만 true입니다.

| 항목 | 값 |
|---|---|
| catalog version | `natural-earth-admin0-and-populated-places-5.1.1-5.1.2` |
| source page | https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/ |
| download | https://naciscdn.org/naturalearth/10m/cultural/ne_10m_populated_places.zip |
| license | Public domain (Natural Earth Terms of Use) |
| source archive SHA-256 | `cd149186f03d2603e0410da399b980a4357d0ac32d3a2305a49ed3dffcc41d7b` |
| generated features | 7,293 (`city` 4,203 / `town` 3,090) |
| generated GeoJSON SHA-256 | `populated-places-index.json`의 `geoJsonSha256` 참조 |

이 layer는 Natural Earth의 지역적 중요도 중심 선별 데이터이며 전 세계 모든 정착지를 포함하는 인구 조사 목록이 아닙니다. 그러므로 combined production catalog의 `scopeComplete`는 false로 유지합니다. 지도 스타일의 label이나 vector tile 속성은 게임 정답 목록에 사용하지 않습니다.

전처리 과정은 다음과 같습니다.

- Polygon/MultiPolygon 좌표를 단순화하지 않고 1:10m 원본 정밀도로 유지
- `ADM0_A3`, 공식 ISO 필드, `NAME_EN`, `NAME_KO`, 대륙/UN region, `LABEL_X`/`LABEL_Y`를 명시적으로 추출
- 표시 이름은 `NAME_KO`가 있으면 한국어, 없으면 영어 사용
- Natural Earth에 모든 국가의 canonical native-name 필드가 없으므로 `nameLocal`은 검증되지 않은 현지명을 꾸며내지 않고 영어 이름으로 fallback
- geometry 전체에서 `bbox` 계산, Natural Earth label point를 selection centroid로 보존
- 258개 feature와 7개 대륙의 id/count/관계를 Zod schema 및 `npm run geodata:validate`로 검증

생성 결과의 SHA-256은 다음과 같습니다.

- `countries.geojson`: `fd4cb879c1a164e98b154b98f272c344859920b2d59a301f78a02a268bab8102`
- `countries-index.json`: `d58ca23d233d5501cc24c2499d2293ef17dcac0debe1b428a0429cf5e75cc574`

재생성은 공식 GeoJSON 변환본을 명시적으로 준비한 뒤 다음과 같이 실행합니다. 앱 런타임은 외부 지리 API나 원본 archive를 요청하지 않습니다.

```bash
npm run geodata:import:countries -- --input=/path/to/ne_10m_admin_0_countries.geojson
```

국가명 `PlaceName[]` migration, JP/KR의 제한된 curated override, 언어별 실제 출제 가능 수와 제외 원칙은 [LANGUAGE_DATA_MIGRATION.md](./LANGUAGE_DATA_MIGRATION.md)에 별도로 기록합니다. 통계는 `npm run geodata:language-stats`로 다시 계산할 수 있습니다.

## 개발 fixture 범위 선언

아래 `custom / development-fixture-2026-07-19` catalog는 단위·브라우저 테스트를 위한 별도 fixture입니다. 일반 production 국가 선택의 데이터 원천이 아닙니다.

| 항목 | 실제 값 |
|---|---|
| catalog version | `dev-fixture-v1` |
| schema version | `1` |
| scope complete | `false` |
| 동기화된 국가 | `KR` 1개 |
| shard | 6개 |
| feature | 13개 |
| byte size | 15,650 bytes, 비압축 JSON |
| 외부 원천 adapter | 없음 |

이 fixture는 전 세계, 아시아, 대한민국, 서울 중 어느 범위도 완전하게 대표하지 않습니다. geometry는 pipeline, 계층, 지도 선택, camera framing 테스트를 위한 간소화 custom 데이터입니다. 행정·법적 경계나 실제 서비스용 위치 정확도의 근거로 사용하면 안 됩니다.

## Feature 수량

`public/geodata/manifest.json`과 shard의 실제 수량은 다음과 같습니다.

| feature type | 수량 | 내용 |
|---|---:|---|
| `continent` | 1 | Asia fixture |
| `country` | 1 | Republic of Korea (`KR`) fixture |
| `admin1` | 2 | Seoul, Gangwon fixture |
| `admin2` | 4 | Jongno, Jung, Yongsan, Mapo fixture |
| `town` | 1 | Jeongseon-eup fixture |
| `station` | 1 | Seoul Station fixture |
| `river` | 1 | Han River fixture |
| `road` | 1 | Sejong-daero fixture |
| `landmark` | 1 | Gyeongbokgung fixture |
| **합계** | **13** | 행정 6, populated place 1, 서울 named feature 4, 계층 root 2 |

서울의 `station`, `road`, `landmark` 3개를 장소/POI 성격의 sample로 볼 수 있지만, 완전한 POI 목록은 아닙니다. 한강 `river`는 별도의 natural feature sample입니다.

## Shard 감사표

| shard | 경로 | feature | bytes | type | dependency |
|---|---|---:|---:|---|---|
| `world-continents` | `/geodata/world/continents.json` | 1 | 1,054 | continent | 없음 |
| `world-countries` | `/geodata/world/countries.json` | 1 | 1,901 | country | world-continents |
| `kr-admin` | `/geodata/countries/KR/admin.json` | 6 | 7,432 | admin1, admin2 | world-countries |
| `kr-populated-places` | `/geodata/countries/KR/populated-places.json` | 1 | 875 | town | kr-admin |
| `seoul-hydrography` | `/geodata/regions/KR-11/hydrography.json` | 1 | 1,203 | river | kr-admin |
| `seoul-places` | `/geodata/regions/KR-11/places.json` | 3 | 3,185 | station, road, landmark | kr-admin |
| **합계** |  | **13** | **15,650** |  |  |

모든 shard는 현재 `compression: "none"`입니다. manifest의 byte size는 UTF-8 파일 바이트 수이며, 각 payload의 `sha256:` checksum도 manifest에 기록됩니다.

## Source와 라이선스 상태

현재 feature의 `source`는 모두 `custom`, `sourceVersion`은 `development-fixture-2026-07-19`입니다. 외부 GeoNames, Overture Maps, OpenStreetMap 배포물을 fixture 생성 과정에 import하는 adapter는 현재 없습니다.

geometry와 메타데이터는 개발 검증용으로 간소화한 project fixture입니다. 저장소에 별도의 데이터 배포 라이선스 파일이 현재 보이지 않으므로, 재배포 권리를 임의로 확대해 해석하지 마세요. 실제 원천을 추가할 때는 원천 이름, 버전/추출일, 다운로드 URL, 적용 라이선스, attribution 문구, 변환 방식, 포함 국가/feature type을 이 문서에 명시해야 합니다.

`GeoDataSource`의 `natural-earth`는 위 production 국가 경계와 도시·수도 point layer에서 실제 사용합니다. `geonames`, `overture`, `osm` 값은 향후 adapter가 정규화 출처를 표시할 수 있도록 예약된 모델 값이며 현재 fixture가 그 원천에서 동기화되었다는 의미가 아닙니다.

## 계층

`parentIds`가 탐색 및 GameScope descendants의 기준입니다.

```text
custom:continent:asia
└─ custom:country:KR
   ├─ custom:admin1:KR-11
   │  ├─ custom:admin2:KR-11-jongno
   │  ├─ custom:admin2:KR-11-jung
   │  ├─ custom:admin2:KR-11-yongsan
   │  ├─ custom:admin2:KR-11-mapo
   │  ├─ custom:station:seoul
   │  ├─ custom:river:han-seoul
   │  ├─ custom:road:sejong-daero
   │  └─ custom:landmark:gyeongbokgung
   └─ custom:admin1:KR-51
      └─ custom:town:jeongseon-eup
```

계층과 geometry가 기능 테스트에 충분하다는 뜻일 뿐, 누락 없는 행정 관계를 뜻하지 않습니다.

## 생성

```bash
npm run geodata:sync -- --scope=world --countries=KR
```

현재 sync script는 네트워크를 호출하지 않고 `scripts/geodata/developmentFixture.ts`에서 6개 shard와 manifest를 결정적으로 다시 생성합니다. `--scope=world`와 `--countries=KR`는 호출 형태의 호환을 위한 제한된 인수입니다. KR 외 국가가 전달되면 source adapter가 없다는 오류를 내고 종료합니다. 명령 이름이나 `world` 인수를 전 세계 동기화의 증거로 해석하면 안 됩니다.

## 검증과 통계

```bash
npm run geodata:validate
npm run geodata:stats
```

검증기는 다음을 확인합니다.

- manifest와 collection의 Zod schema
- file byte size, SHA-256 checksum, feature count
- 좌표 범위와 geometry 구조
- 선언한 centroid와 bbox가 geometry와 일치하는지
- 중복 ID, 누락된 parent, 자기 참조, hierarchy cycle
- shard feature type, country code, source version 메타데이터

`geodata:stats`는 `scopeComplete`, 실제 type/country 수량, source version, 전체 bytes를 JSON으로 출력합니다. 데이터 범위를 보고할 때는 이 출력과 manifest를 기준으로 하세요.

## 런타임 loading과 cache

1. `GeoDataLoader`가 manifest를 `no-cache`로 읽습니다.
2. `catalogVersion`을 IndexedDB cache의 version marker와 비교합니다.
3. 초기 화면은 `continent`/`country` navigation shard만 읽습니다. 국가 선택은 `admin1` index shard를, 지역 선택은 해당 `scopeFeatureIds`의 detail shard를 추가로 읽습니다.
4. root를 기준으로 shard를 고를 때는 `scopeFeatureIds`와 `dependsOn` closure를 사용합니다.
5. cache payload도 manifest checksum과 Zod schema를 다시 검사합니다.
6. version/checksum/schema가 맞지 않는 레코드는 삭제하고 shard를 다시 가져옵니다.
7. IndexedDB를 사용할 수 없으면 memory cache를 사용합니다.

fixture manifest는 `/geodata/manifest.json`에 남아 있지만 production provider의 기본 진입점이 아닙니다. 일반 실행은 `/geodata/world/countries.geojson`, `/geodata/world/countries-index.json`, `/geodata/world/populated-places.json`, `/geodata/world/populated-places-index.json`을 직접 읽습니다. 원격 catalog를 구성한다면 모든 데이터 파일에 올바른 CORS, MIME type, cache 정책을 제공해야 합니다.

## 실제 원천 adapter 추가 체크리스트

1. 원천의 이용약관과 재배포 가능 라이선스를 먼저 확인합니다.
2. 원천 식별자에서 충돌 없는 안정적 `id`를 만듭니다.
3. 이름을 NFC로 정규화하고 `localizedNames`와 `aliases`를 구분합니다.
4. 지원 geometry로 변환하고 centroid/bbox를 계산합니다.
5. `parentIds`, country/admin code, population, importance, 권장 zoom을 채웁니다.
6. 국가/지역/type별 shard를 만들고 dependency를 선언합니다.
7. manifest에 source version, 명확한 불완전 범위, bytes/checksum/count를 기록합니다.
8. 이 문서와 `ATTRIBUTIONS.md`에 원천별 attribution과 라이선스를 기록합니다.
9. `geodata:validate`, 단위 테스트, 실제 지도 검수를 통과시킵니다.

확인되지 않은 데이터를 완전한 데이터라고 표시하거나 라이선스를 추측해서 기록하지 마세요.
