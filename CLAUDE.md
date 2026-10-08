@AGENTS.md

기능 변경을 완료하기 전에 관련 테스트를 실제 실행하고, 최종 통합 검증 결과를 보고한다.

- 반복 개발: `npm run verify:quick -- --scope=<범위>`
- 최종 검증: `npm run verify:full -- --scope=<범위>`
- 릴리즈: `npm run verify:release`
- 실제 OpenFreeMap 증거: `npm run verify:release -- --real-map` (시각 품질은 별도 검토)

명령, 환경 조건, 테스트/지도 품질 증거 구분은 [docs/local-verification.md](docs/local-verification.md)를 참조한다.
