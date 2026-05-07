# Security Threat Review

## 검토 기준

- 기준 시점: 현재 로컬 워킹트리 기준 정적 코드 리뷰
- 검토 범위: Spring Boot 백엔드, React 프론트엔드 인증 흐름, WebSocket/에이전트 제어, 팀 공유 권한, Fly.io 배포 워크플로, 환경변수/시크릿 처리
- 미수행 범위: 실제 침투 테스트, 운영 로그 분석, 외부 의존성 CVE 전체 감사
- 주의: 비밀번호, 토큰, API 키 원문은 문서에 남기지 않음

## 핵심 요약

현재 구조는 1인 포트폴리오/개발용으로는 동작 가능한 수준이지만, 보안 관점에서 가장 큰 위험은 "웹 계정 권한이 곧 원격 서버 제어 권한"으로 이어진다는 점이다. 특히 에이전트 설치 스크립트가 `sudo` 권한을 크게 열어두고, 팀에 공유된 노드도 현재는 사실상 전체 제어 권한을 받는다.

좋은 점도 있다. 운영 시크릿은 환경변수/Fly secrets로 분리되어 있고, refresh token은 DB에 원문 대신 해시로 저장된다. OAuth access token도 URL query가 아니라 fragment로 전달하고, 프론트에서는 메모리에만 들고 있는 구조다. WebSocket 구독도 노드/사용자 단위 권한 검사를 넣어둔 상태다.

## 높은 위험

### 1. 에이전트가 사실상 원격 관리자 권한을 제공함

- 근거: `backend/src/main/resources/static/agent/install.sh`
- 기존 설치본에는 에이전트 사용자에게 `NOPASSWD: ALL` sudo 권한이 남아 있을 수 있다.
- 현재 설치 스크립트는 에이전트 서비스 관리에 필요한 제한된 sudo 명령만 허용하도록 수정했다.
- 웹에서 터미널, 서비스 제어, 프로세스 종료, 업데이트, 삭제 명령을 보낼 수 있다.
- 웹 계정, access token, refresh token, 팀 권한 중 하나가 탈취되면 연결된 서버까지 영향을 받을 수 있다.

대응:

- 기존 서버의 `/etc/sudoers.d/processmanager*` 파일에서 `NOPASSWD: ALL`이 남아 있는지 확인하고 제한된 명령으로 교체한다.
- 터미널 기능은 기본 비활성화하거나 OWNER 전용으로 제한한다.
- 위험 명령은 재확인, 감사 로그, 최근 재인증 중 최소 하나를 넣는다.
- 운영용 노드에는 별도 계정과 제한된 권한으로 에이전트를 설치한다.

### 2. 팀 공유 노드가 세분화 없이 전체 접근으로 열림

- 근거: `team_nodes.access_level`은 존재하지만 실제 조회/명령 권한 검사는 `findAccessibleByUserIdAndNodeId` 중심이다.
- 팀원이 공유 노드에 접근하면 모니터링뿐 아니라 터미널, 파일 목록, 서비스 제어, 프로세스 종료 같은 기능까지 가능해질 수 있다.
- `access_level` 기본값도 `FULL_ACCESS`다.

대응:

- 권한을 `VIEW`, `PROCESS_CONTROL`, `SERVICE_CONTROL`, `TERMINAL`, `ADMIN`처럼 분리한다.
- `TerminalWebSocketController`, `FileWebSocketController`, `ProcessWebSocketController`, `ServiceWebSocketController`, `NodeService`에서 기능별 권한을 각각 검사한다.
- `/teams` UI에도 공유 권한 레벨을 명확히 표시한다.

### 3. 설치용 account token이 장기 권한으로 사용됨

- 근거: `UserController.getToken`, `UserService.reissueToken`, `WebSocketAuthInterceptor`
- 최초 등록 후 노드별 `agent_secret`으로 분리하는 점은 좋다.
- 다만 설치용 account token이 UI와 설치 명령에 노출되고, 토큰 자체는 계정 단위로 새 노드 등록 권한을 가진다.

대응:

- account token은 장기 토큰 대신 1회성/짧은 만료 시간의 설치 토큰으로 바꾼다.
- 토큰 재발급 시 이전 미사용 설치 토큰을 즉시 폐기한다.
- 에이전트 등록 실패, WebSocket connect 실패에 IP/user 기준 rate limit을 둔다.

### 4. 공급망 위험이 큼

- 근거: `install.sh`, `Dockerfile`, `.github/workflows/fly-deploy.yml`
- 설치 방식이 `curl | sudo bash`이고, 에이전트는 GitHub 저장소의 기본 브랜치를 clone/pull 한다.
- GitHub Action도 `superfly/flyctl-actions/setup-flyctl@master`처럼 움직이는 참조를 사용한다.
- Docker base image도 digest 고정이 아니다.

대응:

- 설치 스크립트와 에이전트 버전을 태그/커밋 SHA로 고정한다.
- 가능하면 릴리스 아티팩트 checksum 또는 서명 검증을 추가한다.
- GitHub Actions와 Docker 이미지는 버전 태그 또는 digest로 고정한다.
- 자동 업데이트는 owner가 확인한 버전만 적용되도록 한다.

## 중간 위험

### 5. 마이그레이션 실패 후에도 앱이 계속 뜰 수 있음

- 근거: `DatabaseMigrationConfig.migrate()`가 전체 예외를 잡고 로그만 남긴다.
- 운영 DB 스키마가 불완전해도 앱이 계속 실행될 수 있다.
- `spring.sql.init.mode=always`도 운영에서 계속 적용될 수 있어 스키마 변경 책임이 분산된다.

대응:

- Flyway 또는 Liquibase로 마이그레이션을 일원화한다.
- 운영에서 마이그레이션 실패 시 앱 시작을 실패 처리한다.
- 운영 프로필은 `spring.sql.init.mode=never`로 전환하는 것을 검토한다.

### 6. 감사 로그 테이블은 있으나 실제 기록이 부족함

- 근거: `audit_logs` 테이블은 생성되지만 코드에서 기록하는 경로가 확인되지 않음
- 터미널 열기, 프로세스 종료, 서비스 제어, 노드 삭제/업데이트, 팀 공유 변경은 사후 추적이 꼭 필요하다.

대응:

- 위험 작업마다 `actor_user_id`, `node_id`, `action`, `result`, `ip_address`, `user_agent`를 기록한다.
- 터미널 입력 전문은 저장하지 말고, 세션 시작/종료와 대상 노드만 남긴다.

### 7. WebSocket/API rate limit 부재

- WebSocket connect, refresh token 재발급, 팀 초대, 에이전트 등록, 노드 명령 요청에 별도 rate limit이 보이지 않는다.
- account token은 충분히 길어 brute force 위험은 낮지만, 인증된 사용자의 오남용이나 리소스 고갈은 막기 어렵다.

대응:

- IP/user 기준 rate limit을 Spring filter 또는 reverse proxy 레벨에 추가한다.
- STOMP 메시지별 빈도 제한을 둔다.
- 반복 실패 이벤트는 로그와 UI 알림으로 드러낸다.

### 8. XSS 발생 시 피해 범위가 큼

- access token은 localStorage가 아니라 메모리에 있어 좋은 구조다.
- 하지만 XSS가 발생하면 현재 세션으로 API/WebSocket 명령을 보낼 수 있다.
- CSP, 보안 응답 헤더, 위험 HTML 렌더링 금지 정책은 별도 점검이 필요하다.

대응:

- Content-Security-Policy를 추가한다.
- React에서 `dangerouslySetInnerHTML` 사용 여부를 정기 점검한다.
- 사용자 입력값은 화면 출력 전 escape/sanitize 원칙을 유지한다.

## 낮은 위험 / 강화 항목

### 9. 에러 응답은 대체로 표준화되어 있음

- 근거: `GlobalExceptionHandler`, `ProblemDetail`, 프론트의 안전 메시지 매핑
- 5xx/DB 예외는 내부 메시지를 그대로 내보내지 않는 구조다.
- 4xx는 짧고 차단어가 없는 메시지를 사용자에게 보여줄 수 있으므로, 보안 관련 경로는 더 일반적인 문구로 유지하는 편이 안전하다.

### 10. Gmail OAuth refresh token 운영 관리 필요

- Gmail API scope가 `gmail.send`인 점은 적절하다.
- refresh token, client secret은 GitHub/Fly secrets로만 관리해야 한다.
- 테스트용 Gmail 계정이라도 장기 운영 시 토큰 회전 절차가 필요하다.

### 11. CORS/WebSocket origin은 운영에서 좁게 유지해야 함

- 운영 워크플로는 `https://procmanager.fly.dev`로 맞춰져 있어 현재 방향은 좋다.
- 개발 편의로 `*` 또는 넓은 origin pattern을 넣으면 credential cookie와 WebSocket 때문에 위험해진다.

## 확인된 방어 장치

- `.env`, `backend/.env`, `frontend/.env.local`은 Git/Docker 제외 대상이다.
- 운영 비밀번호와 OAuth/Gmail secret은 환경변수로 주입하는 구조다.
- refresh token은 DB에 원문이 아니라 salt + hash로 저장된다.
- refresh token cookie는 `HttpOnly`, HTTPS 요청 기준 `Secure`, `SameSite=Lax`다.
- access token은 프론트 메모리에 저장하고, OAuth redirect는 fragment를 사용한다.
- 서버 에러는 `ProblemDetail`로 표준화되어 있고 stacktrace/message 노출을 제한한다.
- WebSocket 구독은 사용자/노드 단위 접근 검사를 수행한다.
- 에이전트는 최초 등록 후 노드별 `agent_secret` 해시 기반 재접속 구조를 사용한다.
- 팀 초대는 미가입자에게도 동일 성공 응답을 내려 이메일 가입 여부 노출을 줄인다.

## 권장 작업 순서

1. 팀 공유 노드 권한을 기능별로 분리하고 WebSocket 컨트롤러마다 강제한다.
2. 에이전트 sudo 권한을 최소화하고 터미널 기능을 OWNER 전용 또는 선택 기능으로 바꾼다.
3. 설치용 account token을 만료/1회성 토큰으로 바꾼다.
4. 위험 작업 감사 로그를 실제로 기록한다.
5. 마이그레이션을 Flyway/Liquibase로 이동하고 운영 실패 시 앱 시작을 중단한다.
6. GitHub Actions, Docker image, 에이전트 설치/업데이트 버전을 고정한다.
7. API/WebSocket rate limit과 CSP를 추가한다.
