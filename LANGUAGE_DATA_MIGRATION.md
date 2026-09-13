# GeoType 지명 언어 데이터 마이그레이션

이 문서는 production 세계 국가·도시 dataset의 원천 필드를 언어가 명시된 `PlaceName[]`로 옮긴 범위와 한계를 기록합니다. 자동 번역, 문자 변환, locale 추측은 하지 않습니다.

## 마이그레이션 버전

- language data version: `place-names-v1`
- geometry/catalog source: Natural Earth Admin 0 – Countries 1:10m v5.1.1
- populated place source: Natural Earth Populated Places 1:10m v5.1.2
- curated override snapshot: 2026-07-19

## 기계적으로 옮길 수 있는 필드

Natural Earth 원본에서 locale가 필드명으로 확인되는 값만 옮깁니다.

| 원본 | PlaceName | 적용 수 |
|---|---|---:|
| `NAME_KO` | `locale=ko`, `script=Kore`, `kind=localized`, preferred | 258 |
| `NAME_EN` | `locale=en`, `script=Latn`, `kind=localized`, preferred | 258 |

`aliases`는 한국어·영어 이름, 약칭, ISO/ADM0 code, 정식명 등이 한 배열에 섞여 있고 개별 locale/kind provenance가 없습니다. 따라서 검색 호환용 legacy 필드로만 유지하며 **어떤 alias도 추측으로 `PlaceName`에 넣지 않습니다.** 기존 `nameLocal`도 모든 국가의 검증된 현지명이 아니라 영어 fallback이므로 native 이름으로 사용하지 않습니다.

대륙 7개와 합성 세계 scope에는 코드에 명시된 한국어/영어 이름만 등록합니다.

## Populated Places 언어 필드

Natural Earth Populated Places 원본의 locale-explicit 필드만 옮깁니다. 이 layer는 7,342개 원본 point 중 공식 도시·마을·수도 분류 7,293개를 사용합니다.

| 원본 | PlaceName | 적용 수 |
|---|---|---:|
| `NAME_KO` | `locale=ko`, source script, `kind=localized`, preferred | 7,293 |
| `NAME_EN` | `locale=en`, source script, `kind=localized`, preferred | 7,293 |
| `NAMEASCII` | `locale=en`, `script=Latn`, `kind=romanized`, preferred | 7,293 |
| profile 국가의 `NAME_DE/AR/FR/JA/RU` | 해당 locale, source script, `kind=localized` | 원본 필드가 있는 항목만 |

각 도시·마을 feature는 원본 `ADM0_A3`로 Natural Earth country parent에 연결됩니다. `NAME`·`NAMEALT`·`NAMEPAR`는 legacy 검색 aliases에만 남기며 언어 provenance가 없는 값을 새 `PlaceName`으로 승격하지 않습니다. `NAME_JA`는 일본어 표기이며 읽기 필드가 아니므로 `ja-reading`으로 변환하지 않습니다.

## JP/KR curated override

JP와 KR에만 작은 수동 override를 둡니다. 값은 Wikidata structured entity data의 명시된 label/alias snapshot에서 그대로 골랐으며, Wikidata structured data는 CC0입니다.

### 일본 (`JP`, Wikidata Q17)

원천 snapshot: <https://www.wikidata.org/w/index.php?title=Q17&oldid=2518916955>

| 값 | locale / script | kind | preferred | 원천 field |
|---|---|---|---|---|
| `日本` | `ja` / `Hani` | short | yes | Japanese label |
| `にほん` | `ja` / `Hira` | reading | yes | Japanese alias |
| `にっぽん` | `ja` / `Hira` | reading | no | Japanese alias |
| `Nihon-koku` | `ja-Latn` / `Latn` | romanized | yes | English alias |
| `Nippon-koku` | `ja-Latn` / `Latn` | romanized | no | English alias |

### 대한민국 (`KR`, Wikidata Q884)

원천 snapshot: <https://www.wikidata.org/w/index.php?title=Q884&oldid=2517817603>

| 값 | locale / script | kind | preferred | 원천 field |
|---|---|---|---|---|
| `대한민국` | `ko` / `Kore` | official | yes | Korean label |
| `한국` | `ko` / `Kore` | short | no | Korean alias |
| `Daehan Minguk` | `ko-Latn` / `Latn` | romanized | yes | English alias |
| `Daehanminguk` | `ko-Latn` / `Latn` | romanized | no | English alias |

License reference: <https://www.wikidata.org/wiki/Wikidata:Copyright> (structured data CC0).

Wikidata의 다른 별칭에는 역사명·수사적 명칭·표기 변형이 섞여 있으므로 모두 가져오지 않습니다. 위 표의 최소 항목만 명시적으로 허용합니다.

## 지원 범위와 제외 원칙

- 한국어 국가·도시 문제: Natural Earth `NAME_KO`가 있는 feature만 사용
- 영어 국가·도시 문제: Natural Earth `NAME_EN`이 있는 feature만 사용
- 일본어 한자: Natural Earth `NAME_JA`가 있는 일본 feature와 실제 override만 사용; 읽기는 reading 원천이 있는 값만 사용
- native: 검증된 native name과 country language profile이 함께 있는 feature만 사용
- romanized: 명시된 romanized 이름을 우선하고 resolver의 문서화된 영어 fallback만 사용
- 값이 없으면 `null`/출제 제외; 영어를 native처럼 위장하거나 자동 음역하지 않음
- 일본어 한자를 읽기로 자동 변환하지 않으며, 중국어 간체·번체를 자동 변환하지 않음

실제 출제 가능 수는 정적 숫자를 복사하지 않고 `npm run geodata:language-stats`가 현재 provider output과 정답 resolver로 계산합니다.

2026-09-13 검증 실행 결과 (`npm run geodata:language-stats`):

| 모드 | 후보 | 출제 가능 | 제외 |
|---|---:|---:|---:|
| 한국어 | 7,551 | 7,551 | 0 |
| 영어 | 7,551 | 7,551 | 0 |
| 현지어 | 7,551 | 1,622 | 5,929 |
| 로마자 | 7,551 | 7,551 | 0 |
| 일본어 한자 (JP 후보만) | 70 | 70 | 0 |
| 일본어 읽기 (JP 후보만) | 70 | 1 | 69 |

현지어 1,622개는 검증된 country language profile과 해당 도시·국가 feature의 locale-explicit 이름이 함께 있는 경우입니다. ISO alpha-2가 있는 feature 가운데 native profile이 없는 국가는 231개이며, profile이 있어도 원천 locale 필드가 비어 있는 개별 point는 제외됩니다. 일본어 한자는 `NAME_JA`가 있는 일본 후보 70개가 출제되지만, 읽기는 별도 원천 reading이 있는 국가 override 1개만 출제됩니다.
