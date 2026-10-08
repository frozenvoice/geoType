# 로컬 검증

Codex·Claude의 기능 변경은 관련 테스트를 실제 실행한 뒤 완료한다. GitHub Actions는 수동 `workflow_dispatch` 전용이며 로컬 검증 때문에 자동 트리거를 추가하지 않는다. 최종 통합 검증은 기존 `npm run check`를 핵심으로 사용한다.

## 환경 준비

Node.js **22, 22.13.0 이상**과 npm을 사용한다. `.nvmrc`는 Node 22를 지정한다. 잠금 파일에 고정된 ESLint 등 도구의 Node 요구사항 때문에 더 낮은 22.x도 검증 대상에서 제외한다.

```bash
npm ci
npm run verify:quick
```

실행기는 Node 버전, `package.json`과 `package-lock.json`의 일치 및 설치된 의존성 버전을 먼저 확인한다. 설치가 없거나 잠금 파일과 다르면 `npm ci`로 환경을 복구한 뒤 다시 실행한다. 실행기가 의존성을 자동 설치하거나 잠금 파일을 갱신하지 않는다.

지리 데이터 JSON/GeoJSON은 `.gitattributes`에서 LF로 고정한다. manifest/index가 실제 byte-size와 SHA-256을 검사하므로 Windows의 `core.autocrlf` 변환도 검증 실패를 일으킨다. 기존 체크아웃에서 이 문제가 발생하면 내용 변경이 없는 파일의 줄바꿈만 원본 LF로 복구한다. manifest/checksum을 새 값으로 바꾸거나 검사를 생략하지 않는다.

Playwright가 사용하는 Chromium이 없다면 브라우저가 필요한 검증은 **ENVIRONMENT INCOMPLETE**로 종료하며 PASS 처리하지 않는다. 브라우저 다운로드는 검증과 분리해 사용자가 준비한다.

```bash
npx playwright install chromium
```

브라우저 실행에 필요한 운영체제 라이브러리, WebGL2 및 사용 가능한 메모리도 필요하다. 설치만 성공했다고 브라우저 테스트가 통과한 것은 아니다.

## Quick / Full / Release

| 명령 | 목적 | 수행 검사 | 브라우저 서버 |
|---|---|---|---|
| `npm run verify:quick` | 변경 중 빠른 피드백 | 기존 lint, typecheck, 변경 범위의 Vitest; UI 관련 범위의 E2E | Vite 개발 서버 |
| `npm run verify:full` | 기능 작업의 최종 통합 검증 | 기존 `npm run check` 1회 + UI 관련 범위의 E2E | check가 만든 프로덕션 빌드의 preview |
| `npm run verify:release` | 릴리즈 준비 | 기존 `npm run check` 1회 + 결정적 E2E 전체, desktop/mobile Chromium | 프로덕션 preview |
| `npm run verify:release -- --real-map` | 릴리즈 검사와 실제 지도 증거 수집 | Release 검사 + 별도 실제 OpenFreeMap E2E, 두 Chromium 프로젝트의 스크린샷·진단 | 결정적 E2E는 production preview; 실지도는 무료 공급자로 고정한 별도 개발 서버 |

`npm run check`는 lint → typecheck → Vitest 전체 → `geodata:validate` → production build를 수행한다. Full과 Release는 이 명령을 그대로 사용하며 동일 검사를 별도 구현하지 않는다. Quick은 production build와 전체 지리 데이터 검증을 대신하지 않는다. Release의 `--scope`는 전체 E2E를 축소하지 않는다.

범위를 생략하면 `all`이다. 여러 영역에 걸친 변경은 쉼표로 지정한다.

```bash
npm run verify:quick -- --scope=game,language
npm run verify:full -- --scope=map,ui
npm run verify:full -- --scope=data
npm run verify:release
npm run verify:release -- --real-map
```

PowerShell에서 npm의 `--` 뒤 옵션 전달이 누락되는 환경은 `npm.cmd run verify:quick -- --scope=tooling`처럼 `npm.cmd`를 사용한다. 실행 로그의 scope와 선택된 파일을 확인한다.

| 범위 | 변경 예 | 실행하는 E2E spec (`e2e/` 기준) |
|---|---|---|
| `all` | 범위 불명확, 여러 영역의 통합 변경 | 결정적 spec 전체 (`real-map-quality.spec.js` 제외) |
| `ui` | 메뉴/HUD/결과, 접근성, 모바일 레이아웃 | `experience.spec.js`, `gameplay.spec.js`, `maplibre-local.spec.js` |
| `map` | 지도·지형·건물 capability, 카메라, 준비 상태, 지도 선택 | `maplibre-local.spec.js`, `experience.spec.js` |
| `game` | 정답 판정, IME, 점수, 타이머, 정지/재개 | `gameplay.spec.js`, `experience.spec.js` |
| `language` | UI 언어, 타이핑 언어, strict/casual, 세션 언어 고정 | `gameplay.spec.js` |
| `data` | 번들 geometry/hierarchy, 데이터 schema/출처 | 이 범위만 선택하면 Quick/Full의 E2E 생략 |
| `tooling` | 검증 실행기, 구성, 빌드 도구 | 이 범위만 선택하면 Quick/Full의 E2E 생략 |

범위 선택은 변경 책임자의 판단이다. 데이터가 지역 선택이나 출제 흐름에 영향을 주면 `data,ui` 또는 `all`을 사용한다. 도구 변경이 브라우저 구성에 영향을 주면 `tooling,map` 또는 `all`을 사용한다. 실행 로그에 실제 선택된 테스트 파일이 기록되므로 실행 내용까지 확인한다.

Quick의 Vitest는 `src/tests/`의 파일 이름으로 선택한다. Full/Release의 Vitest는 범위와 무관하게 전체다. 여러 범위에서 겹친 파일은 한 번만 실행하고, Quick에서 선택된 단위 테스트가 없으면 성공 처리하지 않는다.

| 범위 | Quick 단위 테스트 파일 이름 규칙 |
|---|---|
| `all` | Vitest 전체 |
| `ui` | `browse-screen*`, `selection-store*`, `game-screen-*`, `leaderboard-table*`, `storage-unavailable*` |
| `map` | `map-*` |
| `game` | `game-*` |
| `language` | `language-*`, `game-ime*`, `game-screen-*`, `game-scope*`, `leaderboard*` |
| `data` | `geodata-*`, `world-country-data*`, `game-scope*`, `language-core*` |
| `tooling` | `local-verification*`, `map-quality-script*`, `map-quality-policy*`, `map-quality-network*` |

Release는 모든 결정적 spec을 실행한다. `--real-map`을 추가하면 별도 단계에서 `real-map-quality.spec.js`만 실행한다.

## Playwright 실행과 증거

검증 실행기는 기존 `npm run e2e`와 `playwright.config.ts`를 사용한다. `chromium`은 1440×900 desktop, `mobile-chromium`은 390×844 모바일 뷰포트와 터치 에뮬레이션이다. 실제 Android/iOS 기기의 증거는 아니다. 관련 E2E는 두 프로젝트에서 실행한다.

기존 서버 정책을 유지한다. 4173 포트에 별도 서버를 시작하고 `--strictPort`, `reuseExistingServer: false`로 다른 앱의 서버를 재사용하거나 종료하지 않는다. Full/Release의 결정적 E2E는 `GEOTYPE_E2E_PREVIEW=1`로 빌드 결과를 검사한다. 실패 시 스크린샷, trace 및 video를 유지하는 기존 정책을 재사용한다. 검증 실행기는 두 프로젝트를 worker 1개, 재시도 0회로 실행하며 `test.only`를 금지한다.

Vitest도 `test.only`를 금지한다. 테스트가 0개이거나 생략된 테스트가 있으면 실행기의 완료 상태는 `ENVIRONMENT INCOMPLETE`이며, 실패·flaky 결과를 PASS로 승격하지 않는다. Playwright 수량은 해당 실행의 JSON reporter에서 읽는다.

검증 명령의 check/build와 모든 E2E 서버 단계는 [공통 환경 설정](../scripts/verification-environment.ts)을 사용한다. 무료 OpenFreeMap, production geodata(`/geodata`, fixture 기본 비활성), 로컬 leaderboard를 고정하고 외부 토큰/PMTiles/HTTP API 설정을 비운다. 이 값이 로컬 `.env`보다 우선하므로 결정적 E2E의 production 번들도 같은 표준 환경에서 만든다. 사용자 지정 공급자·DEM·빌드 설정은 별도 품질 워크플로에서 확인해야 한다.

기본 결정적 spec은 [offlineBoundary fixture](../e2e/deterministic-test.js)로 로컬 서버 밖의 네트워크 요청을 차단한다. 합성 지도와 오류 복구 테스트는 필요한 스타일/오류 응답을 개별 page route에서 로컬로 제공한다. 예상하지 않은 외부 요청이 생기면 테스트가 실패한다. 이 검사로 실제 OpenFreeMap 리소스를 확인하지 않는다.

실지도는 결정적 E2E가 끝난 뒤 독립된 새 개발 서버에서 수집한다. 동일한 표준 환경의 무료 OpenFreeMap에만 실제 요청을 허용해 결정적 기능 검사와 증거를 분리한다. 이 별도 개발 서버의 증거를 production 번들의 실지도 품질 검증으로 승격하지 않는다.

각 실행은 무시된 `.verification/<run-id>/report.json`에 전체 결과를 남긴다. 보고서에서 테스트 수·상태·환경 문제·생략 사유와 Playwright 증거를 확인한다. 단계별 로그는 `<step-id>/output.log`이며 브라우저 증거는 다음 경로에 보존한다. 실행기가 이 경로로 출력 위치만 옮기므로 후속 실행이 이전 증거를 덮어쓰지 않는다. 이 생성물은 커밋하지 않는다.

```text
.verification/<run-id>/
  report.json
  <step-id>/output.log         # lint, typecheck, unit 또는 check
  e2e/
    output.log
    playwright.json
    html/index.html
    artifacts/                # 실패 스크린샷, trace, video 등
  real-map/                   # --real-map을 요청했을 때만
    output.log
    playwright.json
    html/index.html
    artifacts/                # 실지도 스크린샷 및 real-map-evidence.json
```

직접 `npm run e2e`를 실행할 때만 기본 `playwright-report/`, `test-results/` 출력 경로를 사용한다. 검증 명령의 종료 코드와 전체 상태는 다음과 같다. 개별 브라우저 단계의 assertion 통과 여부 및 실지도 시각 검토 상태는 전체 자동 게이트 상태와 별도로 확인한다.

| 종료 코드 | 상태 | 의미 |
|---|---|---|
| `0` | `PASSED` | 선택한 자동 게이트 통과; 실지도 시각 품질 승인 의미는 없음 |
| `1` | `FAILED` | 실제 실행한 필수 검사 실패 |
| `2` | `ENVIRONMENT INCOMPLETE` | Node/잠금 파일/설치/브라우저 등 실행 환경 부족 또는 잘못된 옵션 |

브라우저 미설치는 환경 부족으로 기록한다. 필요한 앞 단계가 실패하면 뒤 단계는 `NOT RUN`이며, 범위 때문에 E2E를 생략하면 그 사유를 보고서에 남긴다. 실패와 환경 부족이 함께 있으면 전체 실패 상태를 우선한다.

실행기는 `geodata:import:countries`, `geodata:import:places`, `geodata:sync`를 호출하지 않는다. 현재 번들 파일과 `DATA_SOURCES.md`, `ATTRIBUTIONS.md`의 계약을 검증하고, 외부 수집·동기화는 데이터 변경 작업에서 별도로 수행한다.

## 기능 테스트와 실제 지도 품질

다음 증거를 구분해서 보고한다.

| 증거 | 확인할 수 있는 내용 | 확인할 수 없는 내용 |
|---|---|---|
| `?mapProvider=test`, `fixture=1`, DOM 지도 E2E | 지역 선택, 입력 판정, 타이머, 언어, 화면 흐름 | 실제 MapLibre 배경지도와 도로·라벨·지형·건물 품질 |
| 외부 스타일/타일을 로컬 응답으로 대체한 MapLibre E2E | 실제 MapLibre/worker/WebGL2, globe·카메라·geometry·준비 상태, 출처 정제 | 실제 공급자의 지도 데이터 밀도와 시각 품질 |
| `--real-map` 실제 OpenFreeMap E2E | 실제 style/tile 로드, 세계/KR 선택, 서울 zoom/pitch, 건물 runtime/렌더 geometry, desktop/mobile 화면·진단 | 화면의 사람이 판단하는 품질 합격, 다른 공급자, 기본 스타일에 없는 DEM terrain |
| `npm run map:quality`와 항목별 수동 검토 | 해당 실행의 실제 공급자·화면·적용 capability에 대한 품질 게이트 | 실행하지 않은 공급자/DEM/기기 품질 |

실지도 수집은 `--real-map`으로 명시적으로 켠다. 무료 OpenFreeMap 리소스를 사용하며 유료 공급자 요청은 허용하지 않는다. 브라우저/WebGL/네트워크가 부족하거나 실제 리소스가 실패하면 환경 문제 또는 실패를 기록한다. test provider로 대체해 실지도 PASS를 만들지 않는다.

카메라 이동으로 필요 없어진 OpenFreeMap의 `z/x/y` 타일을 Chromium이 `net::ERR_ABORTED`로 보고하면 `cancelledRequests`에 보존한다. HTTP·DNS·연결 오류와 style/TileJSON/font/sprite 실패는 계속 실패로 처리한다. 실제 타일 응답과 지도 준비 상태, 지역 geometry, 건물 렌더링 assertion도 그대로 요구한다.

실지도 자동 assertion이 모두 통과해도 시각 품질 상태는 **REVIEW REQUIRED**다. 세계 구면, 한국 경계, 서울 도로/수계/라벨, 모바일 HUD, 실제 3D 건물 extrusion을 스크린샷으로 별도 검토한다. `renderedBuildingCount`나 `active` 플래그는 진단이며 건물 외관의 합격 판정이 아니다. 기본 OpenFreeMap Liberty에는 `raster-dem`이 없어 실제 terrain 품질은 **UNSUPPORTED / 미검증**이다. synthetic DEM/capability 테스트의 통과를 실제 지형 품질로 승격하지 않는다.

기존 `npm run map:quality`의 정책은 [README 품질 게이트](../README.md#품질-게이트)를 따른다. 단일 승인 플래그 없이 각 `MAP_QUALITY_*_RESULT`를 실제 화면 검토 후 `pass`/`fail`로 지정한다. 이 명령의 보고서는 `docs/map-quality-report.md`, 화면은 `docs/screenshots/map-quality/`에 기록된다. `--real-map` 수집만으로 기존 수동 품질 게이트를 자동 승인하지 않는다.

## 완료 보고

실행한 명령과 실제 로그를 근거로 다음을 보고한다. 문서에 고정된 테스트 수를 복사하지 않는다.

- 환경: Node/npm 버전, 잠금 파일 확인, 브라우저 사용 가능 여부.
- 검증: Quick/Full/Release 실행 명령, 단위 테스트 수와 성공/실패, geodata 검증과 build 결과.
- 브라우저: E2E 테스트 수와 성공/실패, desktop/mobile 실행 여부, 생략/환경 부족 사유.
- 지도: 결정적 기능 테스트인지 실제 OpenFreeMap인지, 실지도 증거 경로, 3D 건물 runtime과 수동 시각 검토 여부, DEM terrain 등 미검증 항목.
- 증거: `.verification/<run-id>/` 보고서·로그 및 관련 Playwright 첨부 경로.

변경 후 검사 실패가 남으면 해결하거나 원인과 미완료 범위를 명시한다. 병렬 작업이 합쳐진 뒤 Full 또는 Release 통합 게이트를 한 번 실행하고, 새 변경/실패/불확실성이 없다면 같은 전체 검사를 반복하지 않는다.
