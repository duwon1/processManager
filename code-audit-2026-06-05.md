# processManager 종합 코드 감사 리포트

- 작성일: 2026-06-05
- 대상 저장소: `E:\processManager`
- 기준 커밋: `8936ede`
- 범위: 보안 분석, 일반 코드 품질/효율 분석, 제한적 UI 기능 검사
- 코드 수정: 없음
- 민감값 처리: 로컬 `.env` 값, 비밀번호, 토큰, client secret, refresh token 원문은 출력하지 않음

## 결론

현재 저장소는 프론트엔드 빌드와 린트가 통과했고, JDK 21 설치 후 백엔드 Gradle 테스트도 통과했습니다. 보안 쪽에서는 즉시 처리할 항목이 있습니다. 특히 Spring Boot/Tomcat 계열 런타임 업데이트, React Router audit 경고, refresh token logout 처리, WebSocket 결과 메시지 검증은 우선순위가 높습니다.

UI는 `http://localhost:5173` 기준 로그인 화면과 보호 라우트 리다이렉트가 정상 렌더링됐습니다. 다만 백엔드와 에이전트가 실행되지 않아 실제 로그인 후 대시보드/터미널/프로세스 제어까지는 완전 검증하지 못했습니다.

## 검증 결과

| 구분 | 결과 |
|---|---|
| `frontend` lint | 통과: `npm run lint` |
| `frontend` build | 통과: `npm run build` |
| `frontend` dependency audit | 실패: `react-router` 계열 high advisory 2건 |
| `backend` test | 통과: JDK 21 설치 후 `.\gradlew.bat test` |
| UI smoke | 부분 통과: 로그인 화면, 모바일 로그인 화면, 보호 라우트 로그인 리다이렉트 확인 |
| 비밀 파일 추적 | `backend/.env`, `frontend/.env.local`은 Git 추적 안 됨, ignore 적용 확인 |

UI 산출물:

- `outputs/ui-home-5173.png`
- `outputs/ui-home-mobile-5173.png`
- `outputs/ui-dashboard-redirect-5173.png`
- `outputs/frontend-code-quality-ui-audit-2026-06-05.md`

## 우선순위 요약

| 우선순위 | 항목 |
|---|---|
| P1 | Spring Boot 4.0.3이 관리하는 Tomcat 11.0.18에 공개 취약점 범위가 있음 |
| P1 | `react-router-dom@7.13.1` / `react-router@7.13.1`이 `npm audit` high advisory 범위에 있음 |
| P1 | `/api/auth/logout`이 쿠키의 이메일 부분만 보고 refresh token을 폐기할 수 있음 |
| P2 | Linux agent installer가 서비스 사용자에게 passwordless full sudo를 부여함 |
| P2 | Agent install/update가 mutable `master` branch와 unpinned dependencies를 신뢰함 |
| P2 | `/app/process/kill-result` WebSocket 메시지를 브라우저 세션이 위조할 수 있음 |
| P2 | OAuth callback이 아닌 URL의 `accessToken` 문자열 때문에 앱이 빈 화면에 멈출 수 있음 |
| P2 | 메인 화면/사이드바/헤더/알림 컨텍스트에서 같은 API를 중복 폴링함 |
| P2 | 팀 상세 조회 race condition으로 이전 팀 데이터가 현재 팀에 표시될 수 있음 |
| P2 | 운영 설정의 SSH/SQL init/Docker ignore/DB 식별자 노출 리스크 |

## 보안 Findings

### S-01. Spring Boot/Tomcat 런타임 취약 버전 사용

- 우선순위: P1
- 위치: `backend/build.gradle:3`, `backend/build.gradle:28`, `backend/build.gradle:47`, `backend/build.gradle:50`
- 근거:
  - `org.springframework.boot` Gradle plugin이 `4.0.3`으로 고정되어 있습니다.
  - Maven Central의 `spring-boot-dependencies:4.0.3` POM 기준 관리 버전은 Tomcat `11.0.18`, Spring Framework `7.0.5`, Spring Security `7.0.3`입니다.
  - Apache Tomcat 공식 보안 페이지 기준 Tomcat `11.0.18`은 이후 수정된 여러 취약점의 affected range에 포함됩니다. 예: `11.0.0-M1`부터 `11.0.21`까지 영향을 받는 CVE-2026-43515, `11.0.0-M1`부터 `11.0.18`까지 영향을 받는 request smuggling 관련 CVE-2026-24880.
- 영향:
  - 이 앱은 Spring Boot 웹 서버, Security, WebSocket을 인터넷에 노출하는 구조입니다.
  - 일부 Tomcat 취약점은 특정 설정이나 reverse proxy 조건이 필요할 수 있으나, 런타임 기본 계층이 취약 범위에 들어가는 것은 패치 우선순위가 높습니다.
- 권장 조치:
  - Java 설치 후 `.\gradlew.bat dependencies --configuration runtimeClasspath --console=plain`로 실제 resolved version을 확인합니다.
  - Spring Boot를 현재 안정 라인으로 올리고, Boot BOM이 Tomcat `11.0.22` 이상을 아직 포함하지 않으면 `tomcat.version` override 필요성을 검토합니다.
  - 업그레이드 후 `.\gradlew.bat test`, 로그인, WebSocket, OAuth smoke test를 실행합니다.

### S-02. React Router high advisory

- 우선순위: P1
- 위치: `frontend/package.json:19`, `frontend/package-lock.json:2703`, `frontend/package-lock.json:2725`
- 근거:
  - `react-router-dom@7.13.1`이 직접 의존성이고 lockfile은 `react-router@7.13.1`을 사용합니다.
  - `npm audit --audit-level=moderate` 결과 high severity 2건이 보고됐고 `npm audit fix` 가능 상태입니다.
  - GitHub Advisory 중 일부는 `<BrowserRouter>` 선언형 모드에는 영향이 없다고 명시하지만, 현재 lockfile이 advisory 범위에 있는 것은 명확합니다.
- 영향:
  - 이 앱은 SSR/RSC/Framework Mode를 쓰지 않는 Vite SPA로 보여 실제 RCE/XSS 조건은 제한될 수 있습니다.
  - 그래도 라우터는 앱 전체 진입점이므로 audit-clean 버전으로 유지하는 것이 맞습니다.
- 권장 조치:
  - `react-router-dom`과 `react-router`를 `npm audit`이 깨끗한 버전으로 업데이트합니다.
  - 이후 `npm audit`, `npm run lint`, `npm run build`, 주요 라우팅 smoke test를 실행합니다.

### S-03. 비인증 logout 요청으로 다른 사용자의 refresh token 폐기 가능

- 우선순위: P1
- 위치: `backend/src/main/java/com/example/processmanager/security/SecurityConfig.java:62`, `backend/src/main/java/com/example/processmanager/controller/AuthController.java:67`, `backend/src/main/java/com/example/processmanager/controller/AuthController.java:71`, `backend/src/main/java/com/example/processmanager/controller/AuthController.java:73`
- 근거:
  - `/api/auth/**`는 `permitAll`입니다.
  - `logout()`은 `refresh_token` 쿠키를 `email|rawToken` 형태로 split한 뒤, 토큰 원문 검증 없이 `refreshTokenService.revoke(parts[0])`를 호출합니다.
  - 따라서 공격자가 피해자 이메일을 알면 임의 요청에 `refresh_token=victim@example.com|anything` 형태의 쿠키를 넣어 해당 사용자의 refresh token row를 삭제할 수 있습니다.
- 영향:
  - 계정 탈취는 아니지만, 대상 사용자를 강제로 로그아웃시키는 availability/DoS 문제가 됩니다.
- 권장 조치:
  - logout에서도 refresh token을 먼저 검증하고, 검증된 이메일만 revoke합니다.
  - 더 나은 구조는 쿠키에 이메일을 넣지 않고 opaque refresh token/session id만 저장한 뒤 DB에서 해시로 조회하는 방식입니다.

### S-04. WebSocket kill 결과 메시지 위조 가능

- 우선순위: P2
- 위치: `backend/src/main/java/com/example/processmanager/controller/ProcessWebSocketController.java:63`, `backend/src/main/java/com/example/processmanager/controller/ProcessWebSocketController.java:68`, `backend/src/main/java/com/example/processmanager/controller/ProcessWebSocketController.java:73`, `backend/src/main/java/com/example/processmanager/service/ProcessCommandService.java:47`
- 근거:
  - `/app/process/kill-result`는 원래 에이전트가 프로세스 종료 결과를 보내는 경로로 보입니다.
  - 핸들러는 `nodeInfo`가 있으면 세션의 노드 정보를 쓰지만, `nodeInfo == null`이면 payload의 `nodeId`를 그대로 사용해 `/topic/node.{nodeId}.process-kill-result`로 브로드캐스트합니다.
  - 브라우저 WebSocket 세션은 `sessionNodeMap`에 노드 정보가 없으므로, 인증된 사용자가 임의 nodeId/pid/success/message를 publish할 수 있습니다.
- 영향:
  - 실제 프로세스 종료가 실행되는 것은 아니지만, 권한 있는 사용자의 UI에 가짜 성공/실패 결과를 보여줄 수 있습니다.
- 권장 조치:
  - 에이전트 결과용 MessageMapping은 `nodeInfo == null`이면 즉시 거부합니다.
  - 가능하면 브라우저 발신 경로와 에이전트 발신 경로를 분리하고, 에이전트 세션만 결과 endpoint를 사용할 수 있게 검사합니다.

### S-05. Linux agent installer가 서비스 사용자에게 full sudo를 부여함

- 우선순위: P2
- 위치: `backend/src/main/resources/static/agent/install.sh:17`, `backend/src/main/resources/static/agent/install.sh:657`, `backend/src/main/resources/static/agent/install.sh:664`
- 근거:
  - Linux installer는 `AGENT_USER`를 정한 뒤 같은 사용자에게 `NOPASSWD: ALL` sudoers rule을 씁니다.
  - systemd service도 같은 `AGENT_USER`로 실행됩니다.
- 영향:
  - agent 프로세스, update flow, 또는 외부 agent 코드가 한 번 오염되면 해당 사용자에서 root로 상승하기 쉬운 구조입니다.
  - 이 저장소만으로 원격 임의 sudo 실행까지는 증명되지 않았으므로 P2로 보정했습니다.
- 권장 조치:
  - `NOPASSWD: ALL` 대신 필요한 root-owned helper 명령만 allowlist합니다.
  - agent service user, 터미널 사용자, update/uninstall 권한을 분리합니다.
  - 설치 스크립트 테스트에 sudoers 내용 검증을 추가합니다.

### S-06. Agent install/update가 mutable external branch를 신뢰함

- 우선순위: P2
- 위치: `backend/src/main/resources/static/agent/install.sh:541`, `backend/src/main/resources/static/agent/install.sh:542`, `backend/src/main/resources/static/agent/install.sh:634`, `backend/src/main/resources/static/agent/install.ps1:11`, `backend/src/main/resources/static/agent/install.ps1:462`, `backend/src/main/resources/static/agent/install.ps1:463`, `backend/src/main/java/com/example/processmanager/service/ProcessCommandService.java:31`
- 근거:
  - Linux installer는 외부 agent 저장소를 clone하고, update block에서 `git pull origin master` 후 `pip install -r requirements.txt`를 실행합니다.
  - Windows installer도 기본 branch가 `master`이고 requirements를 hash 검증 없이 설치합니다.
  - 백엔드는 agent update command를 보낼 수 있습니다.
- 영향:
  - 외부 agent 저장소, branch 보호, dependency source가 오염되면 관리 대상 호스트에서 새 코드가 실행될 수 있습니다.
  - Linux의 full sudo 설정과 결합하면 영향이 커집니다.
- 권장 조치:
  - mutable branch 대신 signed release artifact, pinned commit SHA, checksum/signature 검증을 사용합니다.
  - Python dependency는 lockfile/hash 검증을 사용합니다.
  - 서버가 허용한 target version만 업데이트하도록 allowlist를 둡니다.

### S-07. OAuth redirect token 처리와 blank-screen 리스크

- 우선순위: P2
- 위치: `frontend/src/context/AuthContext.jsx:70`, `frontend/src/context/AuthContext.jsx:72`, `frontend/src/pages/OAuth2RedirectHandler.jsx:13`, `backend/src/main/java/com/example/processmanager/security/OAuth2SuccessHandler.java:55`
- 근거:
  - 백엔드는 access token을 URL fragment에 담아 `/oauth2/redirect#accessToken=...`로 보냅니다.
  - 프론트엔드는 fragment뿐 아니라 query string의 `accessToken`도 허용합니다.
  - `AuthContext`는 현재 경로가 OAuth callback인지 확인하지 않고 URL search/hash에 `accessToken` 문자열이 있으면 초기 refresh를 건너뜁니다. 이 경우 `setIsAuthChecking(false)`가 호출되지 않아 `/main?accessToken=...` 같은 URL에서 빈 화면이 됩니다.
- 영향:
  - 토큰 query string 허용은 로그/히스토리 노출 리스크가 있고, 현재 구현은 단순 문자열 포함만으로 앱 초기화를 멈출 수 있습니다.
- 권장 조치:
  - query string token 지원을 제거하고 fragment 또는 authorization-code 교환 방식만 유지합니다.
  - 초기 refresh skip 조건은 `window.location.pathname === '/oauth2/redirect'`일 때만 적용합니다.

### S-08. 운영 SSH 기본값과 SQL init 설정이 prod에 그대로 상속될 수 있음

- 우선순위: P2
- 위치: `backend/src/main/resources/application.properties:13`, `backend/src/main/resources/application.properties:37`, `backend/src/main/resources/application.properties:54`, `backend/src/main/resources/application-prod.properties:2`, `Dockerfile:22`
- 근거:
  - base 설정은 `ssh.enabled=${SSH_ENABLED:true}`, `ssh.strict-host-key-checking=${SSH_STRICT_HOST_KEY_CHECKING:no}`입니다.
  - prod 파일은 DB 직접 연결을 설명하지만 `ssh.enabled=false`를 명시하지 않습니다.
  - base 설정의 `spring.sql.init.mode=always`도 prod에서 override하지 않습니다.
  - prod DB URL에는 DB 자동 생성 옵션이 포함되어 있습니다.
- 영향:
  - 운영 env가 누락되면 SSH 터널 시도, host key 검증 약화, SQL init 실행, 과도한 DB 권한 유지 문제가 생길 수 있습니다.
- 권장 조치:
  - prod profile에 `ssh.enabled=false`, `ssh.strict-host-key-checking=yes` 또는 명확한 운영 정책을 둡니다.
  - prod profile에 `spring.sql.init.mode=never`를 명시하고 schema 관리는 migration 도구로 분리합니다.
  - 운영 DB URL/username도 환경 변수로 이동합니다.

### S-09. `.dockerignore` 범위가 민감/불필요 파일을 충분히 막지 않음

- 우선순위: P2
- 위치: `.dockerignore:1`, `.dockerignore:3`, `.dockerignore:5`, `.dockerignore:6`, `Dockerfile:12`
- 근거:
  - 현재 `backend/.env`, `frontend/.env.local`은 제외되어 있고 Git 추적 대상도 아닙니다.
  - 하지만 루트 `.env*`, `**/.env.*`, `backend/src/main/resources/application-local.properties`, IDE/cache/log/output류를 폭넓게 막는 패턴은 부족합니다.
  - `Dockerfile`은 `COPY backend/ ./`를 수행하므로 backend 하위 로컬 파일이 생기면 빌드 context나 stage에 들어갈 수 있습니다.
- 권장 조치:
  - `.dockerignore`에 `.env`, `.env.*`, `**/.env`, `**/.env.*`, `*.env`, `**/application-local.properties`, `**/.gradle`, `**/.idea`, `outputs`, `*.log` 등을 추가합니다.

## 일반 코드 품질 / 효율 Findings

### Q-01. 동일 API 중복 폴링

- 우선순위: P2
- 위치: `frontend/src/components/SideBar.jsx:51`, `frontend/src/pages/Main.jsx:98`, `frontend/src/components/Header.jsx:20`, `frontend/src/context/NotificationContext.jsx:23`
- 근거:
  - `SideBar`와 `Main`이 각각 5초마다 `/api/node/list`, `/api/team/list`를 호출합니다.
  - `Header`와 `NotificationContext`도 `/api/user/me`를 별도로 호출합니다.
- 영향:
  - 로그인 후 기본 화면만으로도 같은 데이터 요청이 중복됩니다. 사용자가 늘면 백엔드 부하와 refresh-token race 가능성이 커집니다.
- 권장 조치:
  - 노드/팀/프로필 데이터를 공통 context 또는 query cache로 모으고, 화면 컴포넌트는 공유 state를 읽게 합니다.

### Q-02. 팀 상세 조회 race condition

- 우선순위: P2
- 위치: `frontend/src/pages/Teams.jsx:79`, `frontend/src/pages/Teams.jsx:114`
- 근거:
  - 팀 A 선택 후 팀 B로 빠르게 바꾸면, 늦게 도착한 팀 A 상세 응답이 현재 state를 덮을 수 있습니다.
  - 요청 완료 시점에 현재 선택 팀이 여전히 같은지 확인하지 않습니다.
- 영향:
  - 멤버/노드 공유/권한 화면이 잘못된 팀 데이터로 보일 수 있습니다.
- 권장 조치:
  - 요청마다 teamId를 캡처하고 응답 적용 직전에 현재 selectedTeam id와 비교합니다.
  - 필요하면 `AbortController` 또는 request sequence id를 둡니다.

### Q-03. Dashboard WebSocket 재연결 중복 가능성

- 우선순위: P2
- 위치: `frontend/src/pages/DashBoard.jsx:445`, `frontend/src/pages/DashBoard.jsx:454`, `frontend/src/pages/DashBoard.jsx:456`
- 근거:
  - `onStompError`, `onWebSocketError`, `onWebSocketClose`가 연속 발생하면 기존 reconnect timer를 clear하지 않고 새 timer를 덮어쓸 수 있습니다.
- 영향:
  - 중복 연결/구독, 오래된 client 잔존, 실시간 데이터 중복 반영 가능성이 있습니다.
- 권장 조치:
  - reconnect 예약 전 기존 timer를 clear하고, 현재 client를 deactivate한 뒤 단일 reconnect만 유지합니다.

### Q-04. 서비스 제어 결과 timeout 정리 누락

- 우선순위: P3
- 위치: `frontend/src/pages/DashBoard.jsx:411`, `frontend/src/pages/DashBoard.jsx:421`
- 근거:
  - 서비스 제어 결과 수신 후 `setTimeout(() => setServiceControlResult(null), 3000)`를 만들지만 cleanup하지 않습니다.
- 영향:
  - 노드 이동/언마운트 후 이전 timeout이 새 화면 상태를 지우거나 unmount 이후 state update를 시도할 수 있습니다.
- 권장 조치:
  - timeout id를 ref로 저장하고 노드 변경/언마운트 시 clear합니다.

### Q-05. 설치 명령어 안내 문구와 실제 상태가 다름

- 우선순위: P2
- 위치: `frontend/src/pages/Main.jsx:54`, `frontend/src/pages/Main.jsx:170`, `frontend/src/pages/Main.jsx:338`
- 근거:
  - 화면은 새로고침 후에도 명령어가 유효하다고 안내하지만, 설치 토큰은 component state에만 저장됩니다.
- 영향:
  - 새로고침하면 아직 유효한 설치 명령어를 다시 볼 수 없어 사용자 경험이 깨집니다.
- 권장 조치:
  - 새로고침 후 복원이 필요하면 서버에서 현재 미사용 토큰 조회 API를 제공하거나, 문구를 실제 동작에 맞게 바꿉니다.

### Q-06. 큰 프론트엔드 컴포넌트로 인한 변경 리스크

- 우선순위: P3
- 위치: `frontend/src/components/TaskManager.jsx`, `frontend/src/pages/DashBoard.jsx`, `frontend/src/pages/Main.jsx`
- 근거:
  - `TaskManager.jsx`는 약 1,600줄, `DashBoard.jsx`는 약 683줄, `Main.jsx`는 약 425줄입니다.
- 영향:
  - 실시간 상태, UI 렌더링, 이벤트 처리, 데이터 파싱이 한 파일에 몰려 있어 회귀 위험이 큽니다.
- 권장 조치:
  - 당장 리팩터링을 크게 하기보다는, 다음 기능 수정 시 데이터 파싱 hook, WebSocket lifecycle hook, 탭별 view 단위로 작게 분리합니다.

## UI 기능 검사

확인한 것:

- `http://localhost:5173` 로그인 화면 정상 렌더링.
- 모바일 폭 `390x844` 로그인 화면에서 버튼/텍스트 겹침 없음.
- `/dashboard` 직접 접근 시 로그인 화면으로 리다이렉트되는 것으로 확인.
- Playwright CLI는 시스템 Chrome 채널로 실행했습니다.

제한:

- 백엔드 테스트는 JDK 21 설치 후 통과했지만, Spring Boot 서버를 장시간 띄운 실제 로그인/에이전트 E2E는 수행하지 않았습니다.
- Google OAuth 실제 로그인, 대시보드 실시간 데이터, 터미널, 프로세스 kill, 서비스 제어, 에이전트 설치/등록은 정적 분석 또는 화면 진입 전 단계까지만 확인했습니다.

## 좋은 점

- Access token을 localStorage에 저장하지 않고 메모리 state에만 둔 점은 XSS 피해면을 줄입니다.
- Refresh token은 HttpOnly cookie로 쓰고 DB에는 해시+salt로 저장합니다.
- MyBatis mapper는 전반적으로 `#{}` 바인딩을 사용하고 있어 SQL injection 위험이 낮습니다.
- WebSocket subscription 권한 검사는 `/topic/node.*`, `/topic/user.*`, agent-scoped topic에 대해 별도로 구현되어 있습니다.
- `backend/.env`, `frontend/.env.local`은 Git 추적 대상이 아니고 ignore 규칙에 걸립니다.
- 프론트엔드 lint/build는 현재 통과합니다.

## 권장 처리 순서

1. Spring Boot/Tomcat/Spring Security resolved version을 Java 설치 후 확인하고, 취약 범위 밖으로 업그레이드합니다.
2. `react-router-dom`을 audit-clean 버전으로 업데이트하고 `npm audit`, `npm run lint`, `npm run build`를 재실행합니다.
3. `/api/auth/logout`에서 refresh token 검증 없이 이메일만으로 revoke하지 않도록 수정합니다.
4. `/app/process/kill-result`를 에이전트 세션 전용으로 제한합니다.
5. Linux installer의 `NOPASSWD: ALL`과 agent update의 mutable branch pull을 제거합니다.
6. OAuth callback 처리에서 query token 허용과 전역 `accessToken` 문자열 검사를 제거/축소합니다.
7. prod profile의 SSH/SQL init/DB 설정을 명시적으로 분리합니다.
8. `.dockerignore`를 `.gitignore`보다 보수적으로 강화합니다.
9. 프론트엔드 중복 polling과 팀 상세 race condition을 테스트로 재현한 뒤 수정합니다.

## 참고한 외부 자료

- Spring Boot dependency versions: https://docs.spring.io/spring-boot/appendix/dependency-versions/index.html
- Spring Boot managed dependency coordinates: https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html
- Apache Tomcat 11 vulnerabilities: https://tomcat.apache.org/security-11.html
- GitHub Advisory GHSA-49rj-9fvp-4h2h: https://github.com/advisories/GHSA-49rj-9fvp-4h2h
- GitHub Advisory GHSA-2j2x-hqr9-3h42: https://github.com/advisories/GHSA-2j2x-hqr9-3h42

## 범위 closure

| 영역 | 상태 |
|---|---|
| Backend controllers/services/security/config/mapper 주요 경로 | Reviewed |
| Frontend routing/auth/main/dashboard/team/notification 주요 경로 | Reviewed |
| Build/deploy/config files | Reviewed |
| Agent installer/update scripts | Reviewed |
| Dependency audit | Partial: npm audit 실행, Gradle runtimeClasspath 확인 |
| UI smoke | Partial: frontend-only smoke |
| Backend runtime/E2E | Partial: Gradle test 통과, OAuth/agent E2E는 deferred |
