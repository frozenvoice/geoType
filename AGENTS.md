# Agent instructions

## GitHub Actions와 로컬 검증 정책

- GitHub 호스팅 CI는 일상 개발·완료의 기본 검증이 아니다. 기존·신규 모든 workflow의 실행 시작점은 `workflow_dispatch`만 허용한다. 재사용 `workflow_call`은 모든 호출 경로가 수동 시작점으로 이어질 때만 허용한다.
- push, pull request, release, tag, `workflow_run`, `repository_dispatch`, schedule 등 자동 이벤트를 추가하지 않는다. 스크립트·hook·webhook·외부 자동화로 Actions를 간접 dispatch하는 경로도 금지한다.
- 사용자가 실제 GitHub Actions 실행을 명시적으로 요청한 경우에만 dispatch·watch·rerun한다. 수정·커밋·푸시·병합·릴리즈 준비·공개 승인은 Actions 실행 승인이 아니다. 로컬 검증이 불가능하다고 원격 실행으로 대체하지 않는다.
- 코드 수정은 아래의 기존 변경 범위별 로컬 lint·타입 검사·테스트·빌드·핵심 동작 검증을 실제 실행한다. 실패 원인을 분석·수정하고 관련 검사를 재실행한다. 실행 명령과 PASS/FAIL/BLOCKED, 미실행 이유를 정확히 보고하며 미실행 검사를 통과로 기록하지 않는다.
- 문서·workflow 정책만 변경하면 관련 문서·YAML/정책·diff 검사를 수행하고 앱 빌드·브라우저 검사는 생략할 수 있다. 트리거를 바꾸더라도 기존 job·step·테스트·빌드·패키징·릴리즈 검증을 보존한다.

## Subagent orchestration

- Use subagents for genuinely independent work that benefits from parallelism.
- Avoid concurrent agents modifying or validating the same files, APIs, or shared build state.
- Give implementation agents clear, non-overlapping ownership.
- Let each subagent perform focused verification for its own work; run the final integrated build/test gate once after parallel work converges.
- Do not repeat the same broad test suite unless new changes, failures, or unresolved concerns justify it.
- Prefer the configured default subagent model. Escalate only after a focused attempt fails to make meaningful progress or the task clearly requires substantially stronger reasoning.

## 작업 완료와 로컬 검증

- Node.js 22(22.13.0 이상)와 커밋된 `package-lock.json`을 사용한다. 의존성 설치는 `npm ci`로 한다.
- 변경 중에는 `npm run verify:quick -- --scope=<범위>`를 실제 실행하고, 최종 통합 검증은 `npm run verify:full -- --scope=<범위>`로 수행한다. 범위는 `all`, `ui`, `map`, `game`, `language`, `data`, `tooling`이며 여러 범위는 쉼표로 지정한다. 범위가 불확실하면 기본값 `all`을 사용한다.
- UI·지도·지역 선택·타이핑 판정·타이머·언어 변경에는 관련 Vitest와 Playwright 회귀 검사를 실행한다. 필요한 회귀 테스트를 보강하고, 명령을 추천하는 것만으로 작업을 완료하지 않는다.
- 릴리즈 준비에는 `npm run verify:release`를 실행한다. 기존 `npm run check`를 전체 검증의 핵심으로 유지하고 lint/typecheck/test/geodata/build 검사를 다른 구현으로 중복하지 않는다.
- 브라우저 미설치, 포트 충돌, WebGL 또는 네트워크 부족은 검증 실패/환경 부족으로 보고한다. 생략된 테스트를 PASS로 기록하지 않는다. 브라우저 설치는 자동 수행하지 않는다.
- 완료 보고에는 실행 명령, 단위/E2E 테스트 수와 성공 여부, desktop/mobile E2E 실행 여부, `.verification/` 보고서와 브라우저 증거 경로, 미검증 항목을 포함한다.
- `?mapProvider=test`, `fixture=1`, DOM 지도 또는 외부 타일을 로컬 응답으로 대체한 MapLibre 테스트는 기능 회귀 증거다. 실제 지도 시각 품질이나 3D 건물 품질의 합격으로 취급하지 않는다.
- 실제 OpenFreeMap 증거가 필요한 경우 `npm run verify:release -- --real-map`을 사용한다. 결정적 Release E2E는 production preview, 별도 실지도 증거는 무료 공급자로 고정한 새 개발 서버에서 수집한다. 스크린샷과 진단을 확인하고 시각 품질은 별도 `REVIEW REQUIRED`로 보고한다. 기존 `npm run map:quality`의 항목별 수동 검토 정책을 유지한다. 기본 스타일에 DEM이 없으므로 실제 terrain 품질은 미검증이다.
- `geodata:validate`, `DATA_SOURCES.md`, `ATTRIBUTIONS.md`의 출처/라이선스 검증을 유지한다. 검증 때 외부 import/sync를 자동 실행하거나 지명·높이를 추측해 만들지 않는다.
- 외부 유료 서비스 호출과 불필요한 새 의존성을 추가하지 않는다.

명령별 범위, 환경 부족 처리와 증거 구분은 [로컬 검증 문서](docs/local-verification.md)를 따른다.
