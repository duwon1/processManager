# 아키텍처 개요

Process Manager는 원격 서버를 웹에서 실시간 모니터링·관리하는 풀스택 애플리케이션입니다.
이 문서는 시스템 구성과 핵심 흐름을 다이어그램으로 설명합니다. 세부 결정 근거는 [ADR](adr/README.md),
API 상세는 [API.md](API.md)와 Swagger UI(`/swagger-ui.html`)를 참고하세요.

## 1. 시스템 구성

에이전트가 백엔드로 **아웃바운드** 연결하므로, 원격 서버에 공인 IP나 포트포워딩이 필요 없습니다.

```mermaid
flowchart LR
    subgraph Client[브라우저]
        R[React 19 + xterm.js]
    end
    subgraph Server[백엔드 - Spring Boot]
        API[REST API]
        WS[STOMP WebSocket 브로커]
        SEC[Security · JWT]
        DB[(MySQL)]
        RT[(Redis · Refresh Token 선택)]
    end
    subgraph Remote[원격 서버]
        A[Python 에이전트 · psutil · PTY]
    end

    R -- HTTPS / REST --> API
    R -- STOMP over WS /ws --> WS
    A -- STOMP over WS /ws-native --> WS
    A -- 관측/제어 --> OS[(리눅스/윈도우 OS)]
    API --- SEC
    API --- DB
    SEC --- DB
    SEC -.선택.- RT
```

## 2. 백엔드 레이어

```mermaid
flowchart TB
    subgraph Controller[Controller 계층]
        RC[REST 컨트롤러<br/>Auth·User·Node·Team·Notification]
        WC[WebSocket 컨트롤러<br/>Telemetry·Process·Service·Terminal·Lifecycle]
    end
    subgraph Service[Service 계층]
        NS[NodeService]
        TS[TerminalService]
        ITS[AgentInstallTokenService]
        RTS[RefreshTokenService]
        NRS[NotificationRuleService]
        PCS[ProcessCommandService]
    end
    subgraph Data[Mapper / DB]
        M[MyBatis Mapper]
        MYSQL[(MySQL)]
    end
    ITC[WebSocketAuthInterceptor]

    RC --> Service
    WC --> Service
    ITC -. STOMP 인증/구독검증 .- WC
    Service --> M --> MYSQL
```

## 3. 로그인 및 토큰 재발급 (ADR-0001)

```mermaid
sequenceDiagram
    participant B as 브라우저(React)
    participant S as 백엔드
    participant G as Google OAuth2

    B->>S: /oauth2/authorization/google
    S->>G: 인증 위임
    G-->>S: 사용자 프로필(email, name, picture)
    S->>S: 사용자 upsert, Access Token(JWT) 발급
    S->>S: Refresh Token 발급(DB엔 salt+해시)
    S-->>B: 302 리다이렉트 (#accessToken=..., Set-Cookie: refresh_token HttpOnly)
    Note over B: Access Token은 메모리에만 보관

    B->>S: 보호 API (Authorization: Bearer)
    S-->>B: 200 OK

    Note over B,S: Access Token 만료(401) 시 자동 재발급
    B->>S: POST /api/auth/refresh (쿠키)
    S->>S: 쿠키 검증 → 새 Access + 회전된 Refresh
    S-->>B: 200 {accessToken}, Set-Cookie 갱신
```

## 4. 에이전트 등록 (ADR-0002)

```mermaid
sequenceDiagram
    participant U as 사용자(브라우저)
    participant S as 백엔드
    participant Sc as 설치 스크립트
    participant A as 에이전트

    U->>S: POST /api/user/install-token
    S-->>U: 1회용 토큰(pmi_..., 5분)
    U->>Sc: 설치 명령어 실행(토큰 포함)
    Sc->>S: POST /api/agent/install-token/validate
    S-->>Sc: valid=true (소비 안 함)
    Sc->>S: POST /api/agent/install-token/claim (agentId)
    S-->>Sc: valid=true (agentId에 선점)
    Sc->>A: 에이전트 기동
    A->>S: STOMP CONNECT (account-token, agent-id, hostname)
    S->>S: 토큰 consume → 노드 등록, agent_secret 발급
    S-->>A: /topic/agent.secret.{agentId} (노드 전용 secret)
    Note over A: 이후 재접속은 agent-secret 사용 (설치 토큰 불필요)
    A->>S: STOMP CONNECT (agent-secret) — 재접속
```

## 5. 실시간 모니터링 흐름 (ADR-0003)

```mermaid
sequenceDiagram
    participant A as 에이전트
    participant S as 백엔드
    participant B as 브라우저

    B->>S: SUBSCRIBE /topic/node.{id}.monitoring
    Note over S: 구독 시 노드 접근 권한 검증
    loop 주기적 수집
        A->>S: SEND /app/monitoring (CPU·MEM·DISK·NET)
        S->>S: heartbeat 갱신 + 알림 규칙 평가
        S-->>B: /topic/node.{id}.monitoring (nodeId·nodeName·updatedAt 부가)
    end
    Note over S,B: 임계치 초과 시 NotificationRuleService가 알림 생성
```

## 6. 노드 소프트 삭제 (ADR-0004)

```mermaid
sequenceDiagram
    participant B as 브라우저
    participant S as 백엔드
    participant A as 에이전트

    B->>S: DELETE /api/node/{id}
    alt 노드 온라인
        S->>S: status="D"(삭제 대기) + 예약 기록
        S-->>A: /topic/agent.command.{agentId} (uninstall)
        A->>A: 자가 언인스톨
        A->>S: SEND /app/agent.uninstall-ack
        S->>S: completeUninstall → 최종 삭제
    else 노드 오프라인
        S->>S: 목록에서 제거 + 예약만 남김
        Note over A,S: 다음 접속 시 자가 삭제 명령 재전송
    end
    Note over S: ACK 미수신 구버전은 DISCONNECT 또는 유예(5s) 후 정리(멱등)
```

## 7. 실시간 메시지 채널 요약

| 방향 | 접두사 | 예시 | 설명 |
|------|--------|------|------|
| 클라이언트 → 서버 | `/app` | `/app/monitoring`, `/app/terminal.input` | SEND 메시지 |
| 서버 → 브라우저 | `/topic/node.{id}.*` | `/topic/node.12.monitoring` | 노드별 브로드캐스트 |
| 서버 → 브라우저 | `/topic/user.{id}.*` | `/topic/user.3.agent.update-result` | 사용자별 알림 |
| 서버 → 에이전트 | `/topic/agent.*.{agentId}` | `/topic/agent.command.<uuid>` | 에이전트 전용 명령 |

> 전체 목적지·페이로드·권한 매핑은 [API.md](API.md)의 "WebSocket / STOMP API" 절을 참고하세요.
