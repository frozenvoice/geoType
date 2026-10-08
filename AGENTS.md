# Agent instructions

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
- GitHub Actions는 `workflow_dispatch` 수동 실행 전용으로 유지한다. 자동 트리거, 외부 유료 서비스 호출, 불필요한 새 의존성을 추가하지 않는다.

명령별 범위, 환경 부족 처리와 증거 구분은 [로컬 검증 문서](docs/local-verification.md)를 따른다.
