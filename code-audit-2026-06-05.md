# processManager 수정 후 종합 재검증 리포트

- 작성일: 2026-06-05
- 대상 저장소: `E:\processManager`
- 기준 HEAD: `b38df88`
- 범위: 기존 `code-audit-2026-06-05.md`와 `frontend-code-quality-ui-audit-2026-06-05.md` findings 처리 및 재검증
- 민감값 처리: 로컬 `.env`, 토큰, 비밀번호, OAuth secret 원문은 출력하지 않음

## 결론

기존 P1/P2 보안 finding과 주요 기능/효율 finding은 코드 변경과 검증으로 대부분 닫았습니다. 특히 Spring Boot/Tomcat, React Router audit, refresh token logout, WebSocket 결과 위조, OAuth blank screen, 중복 polling, 팀 상세 race, service/process/terminal WebSocket 입력 검증은 수정 후 테스트 또는 smoke로 확인했습니다.

외부 agent 공급망 보증은 이 저장소만으로 signed release/hash-lock까지 완성할 수 없어 `부분 해결`로 남깁니다. 대신 full sudo 제거, 제한 sudoers, update target SHA 전달, installer `--ref` 지원까지 적용했습니다.

## 검증 결과

| 구분 | 결과 |
|---|---|
| Backend test | 통과: `backend\gradlew.bat test` |
| Backend Tomcat resolved version | 통과: `tomcat-embed-core:11.0.22` |
| Frontend lint | 통과: `npm run lint` |
| Frontend build | 통과: `npm run build` |
| Frontend audit | 통과: `npm audit --audit-level=moderate`, 0 vulnerabilities |
| React Router resolved version | 통과: `react-router-dom@7.17.0`, `react-router@7.17.0` |
| UI smoke | 통과: `http://localhost:5173/main?accessToken=not-oauth`, `/oauth2/redirect?accessToken=query-token` 모두 로그인 화면 렌더링 |
| 정적 패턴 확인 | `NOPASSWD: ALL`, `git pull origin master`, 전역 `search.includes('accessToken')`, browser kill-result fallback 없음 |

## 변경 요약

- `backend/build.gradle`: Spring Boot `4.0.6`, Tomcat `11.0.22` override.
- `frontend/package.json`, `package-lock.json`: React Router 계열 `7.17.0`.
- `AuthController`, `RefreshTokenService`: logout 시 refresh token 해시가 일치할 때만 revoke.
- WebSocket controllers: agent-only result 처리, service action whitelist, terminal/process payload guard, telemetry item limit.
- `WebSocketAuthInterceptor`: capability JSON을 Jackson `ObjectMapper`로 파싱.
- `NodeService`, `SchedulerConfig`: update/delete 지연 작업을 Spring `TaskScheduler`로 이동.
- `install.sh`, `install.ps1`: `NOPASSWD: ALL` 제거, 제한 sudoers, pinned ref/target SHA update 지원.
- `application-prod.properties`, `.dockerignore`: prod 설정과 build context 보수화.
- Frontend: OAuth token 처리 축소, `AppDataContext` 도입, 팀 상세 race 방지, reconnect/timeout cleanup, 알림 규칙 대상 노드 의미 정리.
- Backend regression tests 추가: refresh token revoke, kill-result spoof, service-control whitelist, terminal payload guard, telemetry limit, capability parser.

## Finding 처리 현황

| ID | 기존 항목 | 상태 | 처리 내용 |
|---|---|---|---|
| S-01 | Spring Boot/Tomcat 취약 범위 | 해결 | Boot `4.0.6`, Tomcat `11.0.22`; dependencyInsight로 확인 |
| S-02 | React Router high advisory | 해결 | `react-router-dom/react-router 7.17.0`, npm audit 0건 |
| S-03 | logout refresh token DoS | 해결 | `revokeIfValid()` 추가, 불일치 토큰은 저장소 변경 없음; 테스트 추가 |
| S-04 | WebSocket kill-result 위조 | 해결 | agent session `nodeInfo` 없으면 결과 무시; 테스트 추가 |
| S-05 | Linux agent full sudo | 해결 | `NOPASSWD: ALL` 제거, 자기 service 관리 명령만 allowlist |
| S-06 | Agent mutable update/install | 부분 해결 | update command에 `targetSha` 전달, agent는 SHA 검증 후 detach checkout; installer `--ref` 지원. signed release와 dependency hash-lock은 외부 agent repo 정책 필요 |
| S-07 | OAuth query token/blank screen | 해결 | OAuth callback hash token만 허용, auth skip은 `/oauth2/redirect` 경로에만 적용; smoke 확인 |
| S-08 | prod SSH/SQL/DB 설정 | 해결 | prod에서 `ssh.enabled=false`, strict host key yes, SQL init never, DB URL/username env화 |
| S-09 | `.dockerignore` 부족 | 해결 | `.env*`, local props, build/cache/log/output/IDE 경로 제외 강화 |
| Q-01 | 동일 API 중복 폴링 | 해결 | `AppDataContext`로 node/team/profile 조회와 polling 통합 |
| Q-02 | 팀 상세 race | 해결 | 요청 sequence ref로 stale response 무시 |
| Q-03 | Dashboard reconnect 중복 | 해결 | 기존 timer clear, stale client deactivate, 단일 reconnect 유지 |
| Q-04 | service-control timeout cleanup | 해결 | timeout id 보관 및 cleanup 추가 |
| Q-05 | 설치 명령어 안내 불일치 | 해결 | 새로고침 후 재표시되지 않는 실제 동작에 맞게 문구 수정 |
| Q-06 | 큰 프론트엔드 컴포넌트 | 부분 해결 | 공통 데이터 context로 일부 책임 분리. 대형 `TaskManager`/`DashBoard` 파일의 완전 분해는 별도 리팩터링 과제로 유지 |
| Q-07 | service-control command 경계 | 해결 | action whitelist, name nonblank, agent command DTO payload 재구성 |
| Q-08 | WebSocket Map payload 타입/범위 | 해결 | terminal size/session/node guard, pid/node positive guard 추가 |
| Q-09 | 대용량 agent payload 제한 | 해결 | metrics/process/device-manager count/field limit 추가 |
| Q-10 | update sleep 기반 scheduling | 해결 | `TaskScheduler`로 삭제 유예/update retry/timeout 예약 |
| Q-11 | capability 수동 JSON 파싱 | 해결 | Jackson JSON parser 사용, boolean key만 반영, 길이 제한 |
| Q-12 | 백엔드 핵심 테스트 부족 | 해결 | 주요 보안/권한/입력 경계 회귀 테스트 추가 |

## 남은 리스크

- 외부 agent 저장소의 signed release, dependency hash lock, release provenance는 이 backend/frontend repo 변경만으로 완결할 수 없습니다.
- 실제 Google OAuth 로그인, 실제 agent 설치/등록/update, 터미널/프로세스/서비스 제어 E2E는 로컬 백엔드+agent+OAuth 계정이 필요한 통합 검증입니다.
- frontend 대형 컴포넌트 완전 분해는 기능 변경 리스크가 커서 이번 보안/품질 수정 범위에서는 부분 개선으로 제한했습니다.

## 추가된 주요 테스트

- `backend/src/test/java/com/example/processmanager/service/RefreshTokenServiceTests.java`
- `backend/src/test/java/com/example/processmanager/controller/ProcessWebSocketControllerTests.java`
- `backend/src/test/java/com/example/processmanager/controller/ServiceWebSocketControllerTests.java`
- `backend/src/test/java/com/example/processmanager/controller/TerminalWebSocketControllerTests.java`
- `backend/src/test/java/com/example/processmanager/controller/NodeTelemetryWebSocketControllerTests.java`
- `backend/src/test/java/com/example/processmanager/config/WebSocketAuthInterceptorTests.java`

## 권장 후속 작업

1. 외부 agent repo에 signed release artifact와 hash-checked dependency lock을 도입합니다.
2. 실제 agent를 붙인 WebSocket E2E를 추가합니다.
3. `TaskManager.jsx`, `DashBoard.jsx`를 다음 기능 수정 시 hook/view 단위로 더 작게 분리합니다.
