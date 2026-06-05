# processManager 최종 조치 상태

- 작성일: 2026-06-05
- 메인 저장소: `E:\processManager`
- 외부 에이전트 저장소: `https://github.com/duwon1/processManager-agent`
- 이전 상세 보고서: `code-audit-2026-06-05.md`, `frontend-code-quality-ui-audit-2026-06-05.md` 삭제 후 이 문서로 통합

## 이번 추가 조치

| 영역 | 조치 |
|---|---|
| Render 배포 설정 | `render.yaml`에 운영 필수값 `DB_URL`, `DB_USERNAME` 선언 추가 |
| 외부 agent update | `processManager-agent` 커밋 `aefa1f4`로 `targetSha` 검증/checkout 적용 |
| 외부 agent dependency lock | `requirements.lock` 추가, update 시 `pip --require-hashes` 우선 사용 |
| 외부 agent 검증 | `pm_agent.update_policy.normalize_target_sha` 단위 테스트 추가 |
| 프론트 구조 | `DashBoard.jsx`의 메트릭 파싱/히스토리 계산을 `frontend/src/utils/dashboardMetrics.js`로 분리 |
| 산출물 정리 | Playwright/Vite/Backend smoke 로그와 `.playwright-cli` 임시 산출물 삭제 |

## 기존 감사 항목 처리 상태

| 항목 | 상태 |
|---|---|
| Spring Boot/Tomcat 취약 버전 | Boot `4.0.6`, Tomcat `11.0.22` 적용 완료 |
| React Router advisory | `react-router-dom@7.17.0`, `react-router@7.17.0` 적용 완료 |
| refresh token logout DoS | token 검증 성공 시에만 revoke |
| WebSocket kill-result 위조 | agent session 없는 result 무시 |
| WebSocket 입력 검증 | service action whitelist, terminal/process payload guard, telemetry limit 추가 |
| OAuth blank screen/query token | callback hash token만 허용, query token 미사용 |
| 중복 API polling | `AppDataContext`로 node/team/profile 조회 통합 |
| 팀 상세 race condition | stale response 무시 |
| Dashboard reconnect/timeout | reconnect 단일화, timeout cleanup 추가 |
| prod 설정 | DB URL/user env화, SQL init off, SSH tunnel off |
| Linux agent sudo | `NOPASSWD: ALL` 제거, 제한 sudoers 적용 |
| update scheduling | 직접 sleep 대신 Spring `TaskScheduler` 사용 |
| frontend 대형 컴포넌트 | `DashBoard.jsx` 순수 유틸 분리 완료. `TaskManager.jsx`는 기능 변경 시 점진 분리 권장 |

## 검증 결과

| 검증 | 결과 |
|---|---|
| `backend\gradlew.bat test --console=plain` | 통과. 현재 Codex 프로세스 PATH만 갱신 전이라 JDK 경로를 명령 환경에 주입해 실행 |
| `frontend\npm run lint` | 통과 |
| `frontend\npm run build` | 통과 |
| `frontend\npm audit --audit-level=moderate` | 0 vulnerabilities |
| Playwright smoke | 로컬 H2 백엔드 `/health` 200, `/main?accessToken=not-oauth` 로그인 화면 렌더링 |
| OAuth query-token smoke | `/oauth2/redirect?accessToken=query-token` 이후 로그인 화면, localStorage 비어 있음 |
| agent `py -m unittest discover -s tests -p 'test_*.py'` | 통과 |
| agent `py -m compileall agent.py pm_agent` | 통과 |
| agent `pip install --dry-run --require-hashes -r requirements.lock` | 통과 |

## 배포 상태

- `render.yaml`은 `autoDeployTrigger: commit`으로 설정되어 있어 메인 저장소 `master` 푸시가 Render 배포를 트리거합니다.
- `RENDER_API_KEY`가 현재 환경변수에 없어 Render API로 배포 실행/상세 상태 조회는 수행할 수 없습니다.
- 푸시 후 공개 헬스체크 URL `https://processmanager-web.onrender.com/health`로 외부 응답을 확인합니다.

## 외부 조건이 필요한 항목

| 항목 | 현재 상태 |
|---|---|
| 실제 Google OAuth 로그인 E2E | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`가 현재 환경에 없어 실제 Google 계정 로그인은 미수행. query-token 차단과 callback 화면 흐름은 smoke 완료 |
| 실제 agent 설치/register/update E2E | 외부 agent repo의 update 안정성 조치는 완료. 실제 원격 OS 설치/등록/터미널/프로세스/서비스 통합 검증은 테스트 계정, 설치 토큰, 대상 OS 권한이 필요 |
