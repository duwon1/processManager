# Process Manager API 문서

원격 서버를 웹에서 실시간 모니터링·관리하는 풀스택 애플리케이션의 백엔드 API 명세입니다.
REST API(HTTP)와 실시간 통신(STOMP over WebSocket) 두 계층으로 구성됩니다.

- **Backend**: Java 21, Spring Boot 4.0.6, MyBatis, MySQL
- **실시간**: WebSocket, STOMP, SockJS
- **인증**: JWT(Access Token) + Refresh Token(HttpOnly Cookie), Google OAuth2

> **📌 문서 안내**
> - **REST API의 최신 소스는 Swagger UI**입니다: 앱 실행 후 [`/swagger-ui.html`](http://localhost:8080/swagger-ui.html)
>   (OpenAPI 스펙: `/v3/api-docs`). 코드의 어노테이션에서 자동 생성되므로 항상 실제 구현과 일치합니다.
>   운영 환경에서는 기본 비활성화이며 `SPRINGDOC_ENABLED=true`로 켤 수 있습니다.
> - **이 문서**는 온보딩용 개요이며, Swagger가 다루지 못하는 **WebSocket/STOMP 명세**의 기준 문서입니다.
> - 구조와 설계 근거: [ARCHITECTURE.md](ARCHITECTURE.md) · [아키텍처 결정 기록(ADR)](adr/README.md)

---

## 목차

1. [공통 사항](#1-공통-사항)
2. [인증 흐름](#2-인증-흐름)
3. [REST API](#3-rest-api)
   - [Auth](#31-auth--apiauth)
   - [User / 설치 토큰](#32-user--apiuser)
   - [Node](#33-node--apinode)
   - [Team](#34-team--apiteam)
   - [Notification](#35-notification--apinotifications)
   - [Notification Rule](#36-notification-rule--apinotification-rules)
   - [Agent Install Token (에이전트용)](#37-agent-install-token--apiagentinstall-token)
   - [Health](#38-health)
4. [WebSocket / STOMP API](#4-websocket--stomp-api)
5. [데이터 모델](#5-데이터-모델)
6. [에러 응답 형식](#6-에러-응답-형식)

---

## 1. 공통 사항

| 항목 | 값 |
|------|-----|
| Base URL (로컬) | `http://localhost:8080` |
| Base URL (운영) | `https://processmanager-web.onrender.com` |
| API 접두사 | `/api` |
| 요청/응답 Content-Type | `application/json` |
| 에러 응답 Content-Type | `application/problem+json` (RFC 7807) |
| 인증 헤더 | `Authorization: Bearer <accessToken>` |
| 시간 형식 | ISO-8601 `LocalDateTime` (예: `2026-07-01T12:34:56`) |

### 접근 권한 규칙 (SecurityConfig)

| 경로 | 인증 |
|------|------|
| `/api/auth/**` | **공개** (인증 불필요) |
| `/api/agent/install-token/validate` | **공개** (에이전트 설치 스크립트용) |
| `/api/agent/install-token/claim` | **공개** (에이전트 설치 스크립트용) |
| `/api/**` (그 외 전부) | **JWT 인증 필요** |
| `/health`, SPA 라우트, 정적 파일, WebSocket 핸드셰이크 | 공개 |

- 세션 정책은 **STATELESS** — 서버 세션을 쓰지 않고 요청마다 JWT로 인증합니다.
- CORS: `app.cors.allowed-origins`(쉼표 구분)에 등록된 출처만 허용, `allowCredentials=true`(Refresh Token 쿠키 전송용).
- 허용 메서드: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.

---

## 2. 인증 흐름

### 2.1 로그인 (Google OAuth2)

1. 사용자가 `/oauth2/authorization/google`로 구글 로그인을 시작합니다.
2. 로그인 성공 시 서버(`OAuth2SuccessHandler`)가:
   - 사용자를 DB에 upsert (`saveOrUpdate`)
   - **Access Token**(JWT, 기본 만료 `jwt.access-expiration`)을 발급
   - **Refresh Token**을 발급하여 DB에 salt+해시로 저장하고, 원문은 **HttpOnly 쿠키**(`refresh_token`)에 담습니다.
   - 프론트엔드 리다이렉트 URI(`app.oauth2.redirect-uri`, 기본 `http://localhost:5173/oauth2/redirect`)로 이동하며, **Access Token은 URL fragment**(`#accessToken=...`)로 전달합니다.
3. 프론트엔드는 fragment에서 Access Token을 추출해 메모리(Context)에 보관합니다.

### 2.2 인증된 요청

모든 보호 API 요청에 헤더를 첨부합니다.

```
Authorization: Bearer <accessToken>
```

`JwtAuthenticationFilter`가 토큰을 검증하고 `subject`(이메일)로 사용자를 식별합니다.

### 2.3 토큰 재발급 (Silent Refresh)

- Access Token 만료 시(HTTP 401) 프론트엔드는 자동으로 `POST /api/auth/refresh`를 호출합니다.
- `refresh_token` 쿠키가 유효하면 새 Access Token을 반환하고, **Refresh Token도 회전(rotation)** 하여 새 쿠키로 교체합니다.
- 동시에 여러 요청이 401을 받아도 refresh는 앱 전체에서 **1번만** 실행됩니다(`useAuthFetch.js`).
- 재발급까지 실패하면 로그아웃 처리합니다.

---

## 3. REST API

### 3.1 Auth — `/api/auth`

> 공개 엔드포인트. 인증 헤더 불필요. `refresh_token` 쿠키 기반으로 동작합니다.

#### `POST /api/auth/refresh`
Refresh Token으로 Access Token을 재발급합니다(회전 방식).

- **요청**: 바디 없음. `refresh_token` 쿠키 필요(`credentials: include`).
- **200 OK**
  ```json
  { "accessToken": "eyJhbGciOiJIUzI1NiJ9..." }
  ```
  응답 시 새 `refresh_token` 쿠키가 `Set-Cookie`로 내려옵니다.
- **401 Unauthorized**: 쿠키가 없거나 만료/불일치 시. 기존 쿠키는 삭제됩니다.
  ```json
  {
    "type": "https://procmanager/errors/auth-required",
    "title": "Unauthorized",
    "status": 401,
    "detail": "인증이 만료되었습니다.",
    "code": "AUTH_REQUIRED",
    "errorId": "..."
  }
  ```

#### `POST /api/auth/logout`
Refresh Token을 DB에서 폐기하고 쿠키를 삭제합니다.

- **요청**: 바디 없음.
- **200 OK**
  ```json
  { "message": "로그아웃 되었습니다." }
  ```

---

### 3.2 User — `/api/user`

> 인증 필요.

#### `GET /api/user/me`
현재 로그인 사용자의 프로필을 조회합니다.

- **200 OK** — [`UserProfileResponse`](#userprofileresponse)
  ```json
  {
    "id": 1,
    "email": "user@example.com",
    "name": "홍길동",
    "picture": "https://.../photo.jpg",
    "createdAt": "2026-06-01T10:00:00"
  }
  ```

#### `GET /api/user/token`
설치 토큰 정책 안내 정보를 반환합니다(토큰 자체는 발급하지 않음).

- **200 OK**
  ```json
  {
    "message": "설치 토큰은 생성 후 한 번만 표시됩니다.",
    "expiresInSeconds": 300,
    "maxExtensions": 2
  }
  ```

#### `POST /api/user/install-token`
에이전트 설치용 **1회용 토큰**을 발급합니다. 새로 만들면 기존 미사용 토큰은 폐기됩니다.

- **요청**: 바디 없음.
- **200 OK** — [`InstallTokenResponse`](#installtokenresponse)
  ```json
  {
    "installToken": "abcd1234...",
    "expiresAt": "2026-07-01T12:05:00",
    "expiresInSeconds": 300,
    "extensionCount": 0,
    "remainingExtensions": 2,
    "message": "설치 토큰이 생성되었습니다."
  }
  ```
  > 토큰은 5분간 유효하며, 등록에 한 번 쓰이면 재사용 불가.

#### `POST /api/user/install-token/extend`
발급된 설치 토큰의 남은 시간을 다시 5분으로 연장합니다(최대 2회).

- **요청** — [`ExtendInstallTokenRequest`](#extendinstalltokenrequest)
  ```json
  { "installToken": "abcd1234..." }
  ```
- **200 OK** — [`InstallTokenResponse`](#installtokenresponse)

#### `POST /api/user/token/reissue`
설치 토큰을 재발급합니다. `POST /api/user/install-token`과 동일하게 동작합니다.

- **200 OK** — [`InstallTokenResponse`](#installtokenresponse)

#### `DELETE /api/user/me`
회원 탈퇴. 계정 및 관련 데이터를 삭제하고 `refresh_token` 쿠키를 제거합니다.

- **200 OK**
  ```json
  { "message": "회원탈퇴가 완료되었습니다." }
  ```

---

### 3.3 Node — `/api/node`

> 인증 필요. 노드는 에이전트가 WebSocket으로 연결될 때 자동 등록됩니다.

#### `GET /api/node/list`
현재 사용자가 접근 가능한 노드 목록(소유 + 팀 공유)을 조회합니다.

- **200 OK** — [`NodeResponse[]`](#noderesponse)
  ```json
  [
    {
      "id": 12,
      "name": "prod-web-01",
      "osType": "Linux",
      "status": "ONLINE",
      "lastSeen": "2026-07-01T12:34:56",
      "createdAt": "2026-06-01T09:00:00",
      "accessSource": "OWNER",
      "sharedTeamIds": null,
      "sharedTeamNames": null,
      "owner": true,
      "canViewMonitoring": true,
      "canUseTerminal": true,
      "canControlProcesses": true,
      "canControlServices": true
    }
  ]
  ```

#### `DELETE /api/node/{id}`
노드를 **삭제 대기** 상태로 전환합니다. 에이전트의 uninstall ACK 수신(또는 연결 해제) 후 실제 삭제됩니다.

- **경로 파라미터**: `id` (Long) — 노드 ID
- **200 OK** — 바디 없음

#### `POST /api/node/{id}/update`
해당 노드의 에이전트에 최신 코드로 업데이트하도록 명령을 전송합니다.

- **경로 파라미터**: `id` (Long)
- **200 OK** — 바디 없음

#### `GET /api/node/updates`
현재 사용자 소유 노드 중 **업데이트 대기(사용 가능)** 상태인 목록을 반환합니다.

- **200 OK** — `Map[]` (노드별 업데이트 상태 정보)

#### `POST /api/node/update-all`
업데이트 대기 중인 모든 노드에 일괄 업데이트 명령을 전송합니다.

- **200 OK** — 바디 없음

---

### 3.4 Team — `/api/team`

> 인증 필요. 팀을 통해 다른 사용자에게 노드 접근 권한을 위임합니다.

#### `GET /api/team/list`
내가 소유하거나 소속된 팀 목록을 조회합니다.

- **200 OK** — [`TeamResponse[]`](#teamresponse)

#### `POST /api/team`
팀을 생성합니다(생성자가 OWNER).

- **요청** — [`TeamRequest`](#teamrequest)
  ```json
  { "name": "백엔드팀", "description": "서버 운영 담당" }
  ```
- **200 OK** — [`TeamResponse`](#teamresponse)

#### `PATCH /api/team/{teamId}`
팀 이름·설명을 수정합니다(OWNER).

- **요청** — [`TeamRequest`](#teamrequest)
- **200 OK** — [`TeamResponse`](#teamresponse)

#### `DELETE /api/team/{teamId}`
팀을 삭제합니다(OWNER).

- **200 OK** — 바디 없음

#### `DELETE /api/team/{teamId}/membership`
현재 사용자가 해당 팀에서 **탈퇴**합니다.

- **200 OK** — 바디 없음

#### `GET /api/team/{teamId}/members`
팀 구성원 목록을 조회합니다.

- **200 OK** — [`TeamMemberResponse[]`](#teammemberresponse)

#### `POST /api/team/{teamId}/members/invite`
이메일로 팀 구성원을 초대합니다(초대 메일·알림 발송).

- **요청** — [`TeamInviteRequest`](#teaminviterequest)
  ```json
  { "email": "invitee@example.com" }
  ```
- **200 OK**
  ```json
  { "message": "초대를 보냈습니다." }
  ```

#### `DELETE /api/team/{teamId}/members/{memberId}`
팀에서 구성원을 제거합니다(OWNER).

- **200 OK** — 바디 없음

#### `PATCH /api/team/{teamId}/members/{memberId}/permissions`
구성원별 노드 접근 권한을 수정합니다(OWNER).

- **요청** — [`TeamMemberPermissionRequest`](#teammemberpermissionrequest)
  ```json
  {
    "canViewMonitoring": true,
    "canUseTerminal": false,
    "canControlProcesses": false,
    "canControlServices": false
  }
  ```
- **200 OK** — [`TeamMemberResponse`](#teammemberresponse)

#### `GET /api/team/invitations`
현재 사용자에게 온 **대기 중 초대** 목록을 조회합니다.

- **200 OK** — [`TeamMemberResponse[]`](#teammemberresponse)

#### `GET /api/team/invitations/link/{token}`
초대 링크 토큰으로 초대 정보를 조회합니다.

- **경로 파라미터**: `token` (String)
- **200 OK** — [`TeamMemberResponse`](#teammemberresponse)

#### `POST /api/team/invitations/{memberId}/accept`
초대를 수락합니다.

- **200 OK** — 바디 없음

#### `POST /api/team/invitations/{memberId}/reject`
초대를 거절합니다.

- **200 OK** — 바디 없음

#### `POST /api/team/invitations/link/{token}/accept`
초대 링크 토큰으로 수락합니다.

- **200 OK** — [`TeamMemberResponse`](#teammemberresponse)

#### `POST /api/team/invitations/link/{token}/reject`
초대 링크 토큰으로 거절합니다.

- **200 OK** — [`TeamMemberResponse`](#teammemberresponse)

#### `GET /api/team/{teamId}/node-options`
팀에 공유할 수 있는 내 노드 목록과 현재 공유 여부를 조회합니다.

- **200 OK** — [`TeamNodeOptionResponse[]`](#teamnodeoptionresponse)

#### `PUT /api/team/{teamId}/nodes`
팀에 공유할 노드 집합을 갱신합니다(전달한 `nodeIds`로 덮어씀).

- **요청** — [`TeamNodeUpdateRequest`](#teamnodeupdaterequest)
  ```json
  { "nodeIds": [12, 15, 20] }
  ```
- **200 OK** — [`TeamNodeOptionResponse[]`](#teamnodeoptionresponse)

---

### 3.5 Notification — `/api/notifications`

> 인증 필요. 사용자별 인앱 알림.

#### `GET /api/notifications`
내 알림 목록을 조회합니다.

- **쿼리 파라미터**: `limit` (Integer, 선택) — 최대 개수
- **200 OK** — [`NotificationResponse[]`](#notificationresponse)

#### `GET /api/notifications/unread-count`
읽지 않은 알림 개수를 조회합니다.

- **200 OK**
  ```json
  { "count": 3 }
  ```

#### `PATCH /api/notifications/{id}/read`
특정 알림을 읽음 처리합니다.

- **200 OK** — [`NotificationResponse`](#notificationresponse)

#### `PATCH /api/notifications/read-all`
모든 알림을 읽음 처리합니다.

- **200 OK** — 바디 없음

#### `DELETE /api/notifications`
내 알림을 전체 삭제합니다.

- **204 No Content**

---

### 3.6 Notification Rule — `/api/notification-rules`

> 인증 필요. 지표 임계치 기반 알림 규칙. 에이전트가 보내는 실시간 지표(`/app/monitoring`)를 평가해 조건 충족 시 알림을 생성합니다.

#### `GET /api/notification-rules`
내 알림 규칙 목록을 조회합니다.

- **200 OK** — [`NotificationRuleResponse[]`](#notificationruleresponse)

#### `POST /api/notification-rules`
알림 규칙을 생성합니다.

- **요청** — [`NotificationRuleRequest`](#notificationrulerequest)
  ```json
  {
    "name": "CPU 과부하",
    "nodeId": 12,
    "metricType": "cpu",
    "severity": "warning",
    "thresholdPercent": 90.0,
    "durationSeconds": 60,
    "cooldownSeconds": 300,
    "enabled": true
  }
  ```
- **200 OK** — [`NotificationRuleResponse`](#notificationruleresponse)

#### `PATCH /api/notification-rules/{id}`
알림 규칙을 수정합니다.

- **요청** — [`NotificationRuleRequest`](#notificationrulerequest)
- **200 OK** — [`NotificationRuleResponse`](#notificationruleresponse)

#### `DELETE /api/notification-rules/{id}`
알림 규칙을 삭제합니다.

- **204 No Content**

---

### 3.7 Agent Install Token — `/api/agent/install-token`

> **공개 엔드포인트**. 에이전트 설치 스크립트가 등록 전 토큰 상태를 확인/선점하는 용도입니다.

#### `POST /api/agent/install-token/validate`
설치 토큰의 유효성만 검증합니다(상태 변경 없음).

- **요청** — [`InstallTokenValidationRequest`](#installtokenvalidationrequest)
  ```json
  { "installToken": "abcd1234...", "agentId": null }
  ```
- **200 OK** — [`InstallTokenValidationResponse`](#installtokenvalidationresponse)
  ```json
  { "valid": true, "code": "OK", "message": "설치 명령어 확인 완료" }
  ```
  실패 예: `{ "valid": false, "code": "EXPIRED", "message": "..." }`

#### `POST /api/agent/install-token/claim`
설치 토큰을 특정 `agentId`로 선점(claim)합니다.

- **요청** — [`InstallTokenValidationRequest`](#installtokenvalidationrequest)
  ```json
  { "installToken": "abcd1234...", "agentId": "agent-uuid-xxxx" }
  ```
- **200 OK** — [`InstallTokenValidationResponse`](#installtokenvalidationresponse)

---

### 3.8 Health

#### `GET /health`
헬스 체크(공개).

- **200 OK**
  ```json
  { "status": "ok" }
  ```

---

## 4. WebSocket / STOMP API

실시간 모니터링·터미널·프로세스 제어는 STOMP over WebSocket으로 이루어집니다.

### 4.1 엔드포인트 & 브로커

| 항목 | 값 | 용도 |
|------|-----|------|
| `/ws` | SockJS | **브라우저(React)** 대시보드 연결 |
| `/ws-native` | 순수 WebSocket | **Python 에이전트** 연결 |
| App prefix | `/app` | 클라이언트 → 서버 전송 접두사 |
| Broker prefix | `/topic` | 서버 → 구독자 브로드캐스트 |
| 메시지 크기 한도 | 4MB (버퍼/프레임), 송신 버퍼 8MB, 송신 타임아웃 20s | 대용량 프로세스·장치 목록 대응 |

### 4.2 STOMP CONNECT 인증 (`WebSocketAuthInterceptor`)

연결 주체에 따라 CONNECT 프레임의 네이티브 헤더로 인증합니다.

**브라우저 (`/ws`)**

| 헤더 | 설명 |
|------|------|
| `jwt` | 로그인 시 발급받은 Access Token. 유효하면 세션에 `userEmail`/`userId` 저장 |

**에이전트 (`/ws-native`)**

| 헤더 | 설명 |
|------|------|
| `account-token` | 신규 등록/재설치용 **1회용 설치 토큰** |
| `agent-secret` | 등록 완료 노드의 **재접속용 전용 secret** (account-token 대체) |
| `agent-id` | 에이전트 고유 식별자 |
| `hostname` | 노드 호스트명 (기본 `unknown`) |
| `os-type` | OS 종류 (기본 `Linux`) |
| `capabilities` | 기능 노출 판단용 boolean JSON (최대 2KB) |

- `account-token`/`agent-secret`이 모두 없으면 → 브라우저로 간주하여 `jwt` 검증.
- `agent-secret`이 있으면 → 등록 노드 재접속(`connectRegisteredAgent`).
- `account-token`만 있으면 → 설치 토큰으로 신규 등록(`registerWithInstallToken`).

### 4.3 구독(SUBSCRIBE) 권한 검증

`/topic/**` 구독 시 소유·권한을 검증합니다.

- `/topic/node.{nodeId}.*` — 노드 접근 권한 확인. suffix별 요구 권한:
  - `terminal.*` → `TERMINAL`
  - `process-kill-result` → `PROCESS_CONTROL`
  - `service-control-result` → `SERVICE_CONTROL`
  - 그 외 → `VIEW_MONITORING`
- `/topic/user.{userId}.*` — 본인 `userId`만 허용.
- `/topic/agent.*.{agentId}` — 세션의 `agentId`와 일치하는 에이전트만 허용.
- 그 외 경로는 거부(`SecurityException`).

### 4.4 브라우저 → 서버 (SEND `/app/...`)

| Destination | Payload | 설명 | 요구 권한 |
|-------------|---------|------|-----------|
| `/app/node.kill` | `{ nodeId, pid }` | 프로세스 종료 요청 | PROCESS_CONTROL |
| `/app/service.request` | `{ nodeId }` | 서비스 목록 요청 | VIEW_MONITORING |
| `/app/node.service-control` | `{ nodeId, name, action }` | 서비스 제어 (`action`: `start`\|`stop`\|`restart`) | SERVICE_CONTROL |
| `/app/system-info.request` | `{ nodeId }` | 시스템 정보 요청 | VIEW_MONITORING |
| `/app/device-manager.request` | `{ nodeId }` | 장치 관리자 정보 요청 | VIEW_MONITORING |
| `/app/terminal.open` | `{ sessionId, nodeId, cols, rows, shell }` | 터미널 세션 열기 (cols 20~300, rows 5~120) | TERMINAL |
| `/app/terminal.input` | [`TerminalInput`](#terminal-메시지) | 키 입력 전송 | TERMINAL |
| `/app/terminal.resize` | [`TerminalResize`](#terminal-메시지) | 터미널 크기 변경 | TERMINAL |
| `/app/terminal.close` | `{ sessionId }` | 터미널 세션 닫기 | TERMINAL |

### 4.5 에이전트 → 서버 (SEND `/app/...`)

| Destination | Payload | 설명 |
|-------------|---------|------|
| `/app/monitoring` | `Map[]` (최대 256) | 실시간 지표(CPU/GPU/메모리/디스크/네트워크). 알림 규칙 평가 수행 |
| `/app/process` | `Map[]` (최대 1000) | 프로세스 목록 |
| `/app/service` | `Map[]` | 서비스 목록 |
| `/app/system-info` | `Map` | 시스템 정보 응답 |
| `/app/device-manager` | `Map` (필드 최대 200) | 장치 관리자 정보 응답 |
| `/app/process/kill-result` | [`ProcessKillResult`](#processkillresult) | 프로세스 종료 결과 회신 |
| `/app/service-control-result` | `Map` | 서비스 제어 결과 회신 |
| `/app/terminal.output` | [`TerminalOutput`](#terminal-메시지) | PTY 출력 스트림 |
| `/app/agent.register-ready` | (헤더만) | 등록 준비 완료 → 서버가 `agent-secret` 발급 전달 |
| `/app/agent.update-available` | `{ currentSha, latestSha }` | 업데이트 가능 알림 |
| `/app/agent.update-result` | `{ success, stage, currentSha, latestSha, message }` | 업데이트 수행 결과 |
| `/app/agent.uninstall-ack` | `{ nodeName }` | 언인스톨 완료 ACK → 노드 최종 삭제 |

### 4.6 서버 → 구독자 (SUBSCRIBE `/topic/...`)

**브라우저가 구독하는 노드/사용자 토픽**

| Topic | 발행 시점 |
|-------|-----------|
| `/topic/node.{nodeId}.monitoring` | 실시간 지표 브로드캐스트 (`nodeId`, `nodeName`, `updatedAt` 부가) |
| `/topic/node.{nodeId}.process` | 프로세스 목록 |
| `/topic/node.{nodeId}.service` | 서비스 목록 |
| `/topic/node.{nodeId}.system-info` | 시스템 정보 |
| `/topic/node.{nodeId}.device-manager` | 장치 관리자 정보 |
| `/topic/node.{nodeId}.process-kill-result` | 프로세스 종료 결과 |
| `/topic/node.{nodeId}.service-control-result` | 서비스 제어 결과 |
| `/topic/node.{nodeId}.uninstall-ack` | 언인스톨 ACK |
| `/topic/user.{userId}.agent.update-available` | 업데이트 가능 알림 |
| `/topic/user.{userId}.agent.update-result` | 업데이트 결과 |

**에이전트가 구독하는 명령 토픽** (`{agentId}`는 해당 에이전트 전용)

| Topic | 용도 |
|-------|------|
| `/topic/agent.command.{agentId}` | 서비스 제어/삭제 등 명령 수신 |
| `/topic/agent.secret.{agentId}` | 노드 전용 `agent-secret` 수신 |
| `/topic/agent.sysinfo-request.{agentId}` | 시스템 정보 요청 수신 |
| `/topic/agent.device-manager-request.{agentId}` | 장치 관리자 정보 요청 수신 |
| `/topic/agent.service-request.{agentId}` | 서비스 목록 요청 수신 |

---

## 5. 데이터 모델

### UserProfileResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Long | 사용자 ID |
| email | String | 이메일 |
| name | String | 이름 |
| picture | String | 프로필 이미지 URL |
| createdAt | LocalDateTime | 가입 시각 |

### NodeResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Long | 노드 ID |
| name | String | 노드 이름(호스트명) |
| osType | String | OS 종류 |
| status | String | 상태(예: ONLINE/OFFLINE) |
| lastSeen | LocalDateTime | 마지막 통신 시각 |
| createdAt | LocalDateTime | 등록 시각 |
| accessSource | String | 접근 출처(OWNER/팀 등) |
| sharedTeamIds | String | 공유 팀 ID(소유자는 null) |
| sharedTeamNames | String | 공유 팀 이름(소유자는 null) |
| owner | Boolean | 소유 여부 |
| canViewMonitoring | Boolean | 모니터링 조회 권한 |
| canUseTerminal | Boolean | 터미널 사용 권한 |
| canControlProcesses | Boolean | 프로세스 제어 권한 |
| canControlServices | Boolean | 서비스 제어 권한 |

> 소유자(`owner=true`)는 모든 권한이 자동으로 true.

### InstallTokenResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| installToken | String | 설치 토큰(생성 시 1회만 표시) |
| expiresAt | LocalDateTime | 만료 시각 |
| expiresInSeconds | long | 남은 유효 시간(초) |
| extensionCount | int | 연장 횟수 |
| remainingExtensions | int | 남은 연장 가능 횟수 |
| message | String | 안내 메시지 |

### ExtendInstallTokenRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| installToken | String | 연장할 설치 토큰 |

### InstallTokenValidationRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| installToken | String | 검증/선점할 토큰 |
| agentId | String | (claim 시) 선점할 에이전트 ID |

### InstallTokenValidationResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| valid | boolean | 유효 여부 |
| code | String | 결과 코드(예: OK/EXPIRED/…) |
| message | String | 설명 메시지 |

### TeamRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| name | String | 팀 이름 |
| description | String | 팀 설명 |

### TeamResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Long | 팀 ID |
| ownerUserId | Long | 소유자 사용자 ID |
| ownerEmail | String | 소유자 이메일 |
| name | String | 팀 이름 |
| description | String | 팀 설명 |
| role | String | 현재 사용자의 역할(OWNER/MEMBER) |
| status | String | 소속 상태 |
| memberCount | Integer | 구성원 수 |
| nodeCount | Integer | 공유 노드 수 |
| createdAt | LocalDateTime | 생성 시각 |

### TeamMemberResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Long | 멤버십 ID |
| teamId | Long | 팀 ID |
| teamName | String | 팀 이름 |
| userId | Long | 사용자 ID |
| email / name / picture | String | 사용자 정보 |
| role | String | OWNER/MEMBER |
| status | String | INVITED/ACCEPTED 등 |
| canViewMonitoring | Boolean | 모니터링 조회 권한 |
| canUseTerminal | Boolean | 터미널 사용 권한 |
| canControlProcesses | Boolean | 프로세스 제어 권한 |
| canControlServices | Boolean | 서비스 제어 권한 |
| invitedByEmail | String | 초대한 사람 이메일 |
| invitedAt / acceptedAt | LocalDateTime | 초대/수락 시각 |

> 역할이 OWNER면 모든 권한이 자동으로 true.

### TeamInviteRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| email | String | 초대할 사용자 이메일 |

### TeamMemberPermissionRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| canViewMonitoring | Boolean | 모니터링 조회 권한 |
| canUseTerminal | Boolean | 터미널 사용 권한 |
| canControlProcesses | Boolean | 프로세스 제어 권한 |
| canControlServices | Boolean | 서비스 제어 권한 |

### TeamNodeOptionResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| nodeId | Long | 노드 ID |
| nodeName | String | 노드 이름 |
| osType | String | OS 종류 |
| status | String | 상태 |
| shared | Boolean | 현재 팀 공유 여부 |

### TeamNodeUpdateRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| nodeIds | Long[] | 팀에 공유할 노드 ID 목록(전체 덮어쓰기) |

### NotificationResponse
| 필드 | 타입 | 설명 |
|------|------|------|
| id | Long | 알림 ID |
| type | String | 알림 유형 |
| severity | String | 심각도 |
| title | String | 제목 |
| message | String | 본문 |
| actionUrl | String | 연결 URL |
| entityType | String | 관련 엔티티 유형 |
| entityId | Long | 관련 엔티티 ID |
| read | boolean | 읽음 여부 |
| readAt | LocalDateTime | 읽은 시각 |
| createdAt | LocalDateTime | 생성 시각 |

### NotificationRuleRequest
| 필드 | 타입 | 설명 |
|------|------|------|
| name | String | 규칙 이름 |
| nodeId | Long | 대상 노드 ID |
| metricType | String | 지표 유형(예: cpu/memory/disk) |
| severity | String | 심각도 |
| thresholdPercent | Double | 임계치(%) |
| durationSeconds | Integer | 지속 시간(초) — 이 시간 이상 초과 시 발동 |
| cooldownSeconds | Integer | 쿨다운(초) — 재발동 방지 |
| enabled | Boolean | 활성화 여부 |

### NotificationRuleResponse
`NotificationRuleRequest`의 모든 필드 + `id`, `nodeName`, `lastTriggeredAt`, `createdAt`, `updatedAt`.

### Terminal 메시지
| 레코드 | 필드 |
|--------|------|
| TerminalInput | `sessionId`(String), `nodeId`(Long), `data`(String) |
| TerminalOutput | `sessionId`(String), `nodeId`(Long), `data`(String, ANSI 포함) |
| TerminalResize | `sessionId`(String), `nodeId`(Long), `cols`(int), `rows`(int) |

### ProcessKillResult
| 필드 | 타입 | 설명 |
|------|------|------|
| requestId | String | 요청 식별자 |
| pid | int | 대상 프로세스 PID |
| success | boolean | 성공 여부 |
| message | String | 결과 메시지 |
| nodeId | Long | 노드 ID |
| nodeName | String | 노드 이름 |

---

## 6. 에러 응답 형식

모든 에러는 **RFC 7807 Problem Detail**(`application/problem+json`) 형식으로 반환됩니다(`GlobalExceptionHandler`).

```json
{
  "type": "https://procmanager/errors/bad-request",
  "title": "Bad Request",
  "status": 400,
  "detail": "요청값이 올바르지 않습니다.",
  "instance": "/api/team",
  "code": "BAD_REQUEST",
  "errorId": "3f2a1c9e-..."
}
```

| 예외 | HTTP | code |
|------|------|------|
| IllegalArgumentException | 400 | BAD_REQUEST |
| IllegalStateException | 409 | REQUEST_CONFLICT |
| SecurityException | 403 | FORBIDDEN |
| NoResourceFoundException | 404 | NOT_FOUND |
| DataAccessException | 500 | DATA_ACCESS_ERROR |
| 기타 Exception | 500 | INTERNAL_ERROR |
| 인증 실패(필터 단) | 401 | (Unauthorized) |

- `errorId`는 요청마다 생성되어 서버 로그와 대조할 수 있습니다.
- 내부 메시지에 SQL/스택트레이스 등 민감 정보가 감지되면 일반화된 메시지로 대체됩니다.

---

*문서 생성일: 2026-07-01 · 소스 기준: `backend/src/main/java/com/example/processmanager`*
