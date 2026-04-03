# ProcessManager 프로젝트 전체 평가 보고서

> 작성일: 2026-04-03  
> 대상: 백엔드(Spring Boot) / 프론트엔드(React) / 에이전트(Python)

---

## 1. 프로젝트 개요

분산 서버의 시스템 메트릭과 프로세스를 실시간으로 모니터링하고 원격으로 프로세스를 종료할 수 있는 웹 기반 관리 시스템입니다.

### 기술 스택

| 영역 | 기술 |
|------|------|
| 백엔드 | Spring Boot 4.0.3, Java 21, MyBatis, WebSocket/STOMP |
| 프론트엔드 | React 19, Vite, Bootstrap 5 (Vapor 테마), Recharts, SockJS/Stomp.js |
| 에이전트 | Python 3.10, FastAPI, psutil, websockets |
| 데이터베이스 | MySQL (SSH 터널 접속) |
| 인증 | Google OAuth2 + JWT + Refresh Token (회전 패턴) |

### 아키텍처

```
┌──────────────┐       WebSocket (/ws)        ┌──────────────────┐
│   브라우저    │ ←──────────────────────────→  │                  │
│  (React SPA) │       HTTP REST (/api)       │   Spring Boot    │
│              │ ──────────────────────────→   │   백엔드 서버     │
└──────────────┘                               │                  │
                                               │  - STOMP 브로커  │
┌──────────────┐  WebSocket (/ws-native)      │  - JWT 인증      │
│ Python 에이전트│ ←──────────────────────────→  │  - MyBatis ORM   │
│ (각 서버 1개) │                               └────────┬─────────┘
└──────────────┘                                        │
                                               ┌────────▼─────────┐
                                               │   MySQL (SSH)    │
                                               │  - users         │
                                               │  - nodes         │
                                               │  - refresh_tokens│
                                               └──────────────────┘
```

### 통신 흐름

```
에이전트 → 단일 WebSocket 연결 → 스프링 STOMP 브로커
  ├── /app/monitoring         (메트릭 전송, 2초 간격)
  ├── /app/process            (프로세스 목록 전송, 2초 간격)
  ├── /topic/agent.command    (kill 명령 수신, 구독)
  └── /app/process/kill-result (kill 결과 전송)

브라우저 → SockJS WebSocket 연결 → 스프링 STOMP 브로커
  ├── /topic/monitoring       (메트릭 수신, 구독)
  ├── /topic/process          (프로세스 수신, 구독)
  ├── /topic/process-kill-result (kill 결과 수신, 구독)
  └── /app/node.kill          (kill 명령 전송)
```

---

## 2. 잘 된 점

### 인증 체계
- OAuth2 (Google) + JWT + Refresh Token 회전 패턴으로 견고한 보안 구조
- HttpOnly 쿠키에 Refresh Token 저장 (XSS 방어)
- SHA-256(salt + token) 해싱으로 DB에 안전하게 저장
- 프론트엔드의 자동 토큰 갱신 (401 수신 시 Silent Refresh)

### 에이전트 관리
- 에이전트 첫 연결 시 자동 등록 (hostname 기반 식별)
- 재연결 시 기존 노드 식별 후 상태만 갱신
- 단일 WebSocket 연결로 모니터링 + 프로세스 + kill 명령 통합 처리

### 프론트엔드
- 반응형 UI (데스크톱 테이블 + 모바일 카드 뷰)
- 드래그로 컬럼 크기 조절 가능
- 컬럼 표시/숨김 토글
- `useDeferredValue`로 검색 디바운싱 최적화

### 프로세스 종료 (kill)
- 전체 WebSocket 기반 (HTTP 없음): 브라우저 → 백엔드 → 에이전트
- NAT/방화벽 환경에서도 동작 (에이전트가 먼저 연결하므로)
- 인라인 확인/취소 UI로 오조작 방지

---

## 3. 문제점 및 대안

### 3.1 보안 (즉시 수정 필요)

#### 시크릿 평문 노출
- **위치**: `application.properties`
- **내용**: OAuth2 client secret, SSH 비밀번호, JWT secret이 소스코드에 평문으로 포함
- **위험**: Git 히스토리에 영구 기록, 저장소 공개 시 전체 시스템 탈취 가능
- **대안**: 환경변수 또는 `.env` 파일로 분리, `.gitignore`에 추가
  ```properties
  # 변경 전
  ssh.password=1234
  jwt.secret=processManagerSecretKey...

  # 변경 후
  ssh.password=${SSH_PASSWORD}
  jwt.secret=${JWT_SECRET}
  ```

#### JWT가 URL 쿼리 파라미터에 노출
- **위치**: `OAuth2SuccessHandler.java`
- **내용**: 로그인 후 `?accessToken=jwt`로 리다이렉트
- **위험**: 브라우저 히스토리, Referrer 헤더, 서버 로그에 토큰 기록
- **대안**: URL fragment(`#`)로 변경하거나, 일회성 code를 발급해 POST로 교환

#### 에이전트 토큰 무기한
- **위치**: `UserService.generateToken()`
- **내용**: `pm_` 접두사 + 64자 hex 토큰에 만료가 없음
- **위험**: 토큰 유출 시 영구적으로 에이전트 사칭 가능
- **대안**: 토큰에 만료일 추가, 주기적 자동 회전

---

### 3.2 구조적 문제 (중기 개선)

#### 오프라인 감지가 수동적
- **위치**: `NodeService.resolveNodeStatus()`
- **내용**: 노드 목록을 조회할 때만 15초 임계값으로 상태를 계산함
- **문제**: 아무도 조회하지 않으면 DB에 "온라인"으로 남아있음
- **대안**: `@Scheduled`로 15초마다 stale 노드를 자동 스캔
  ```java
  @Scheduled(fixedRate = 15000)
  public void markStaleNodesOffline() {
      nodeMapper.updateStaleNodes(NODE_OFFLINE_THRESHOLD);
  }
  ```

#### heartbeat DB 업데이트 과다
- **위치**: `NodeService.touchNode()` → `NodeMapper.updateHeartbeat()`
- **내용**: 에이전트 메시지(2초마다)마다 `UPDATE nodes SET last_seen=NOW()` 실행
- **문제**: 에이전트 10대 × 0.5 QPS = 초당 5회 불필요한 UPDATE
- **대안**: 메모리(`ConcurrentHashMap`)에 캐시, 10초마다 일괄 flush
  ```java
  private final Map<Long, Instant> heartbeatCache = new ConcurrentHashMap<>();

  public void touchNode(Long nodeId) {
      heartbeatCache.put(nodeId, Instant.now());
  }

  @Scheduled(fixedRate = 10000)
  public void flushHeartbeats() {
      heartbeatCache.forEach((id, ts) -> nodeMapper.updateHeartbeat(id));
      heartbeatCache.clear();
  }
  ```

#### 프로세스 데이터 전체 브로드캐스트
- **위치**: `ApiController.broadcastProcesses()` → `/topic/process`
- **내용**: 모든 에이전트의 데이터가 모든 브라우저에 전달됨
- **문제**: 에이전트 10대면 브라우저가 10배 데이터를 받고 9/10을 버림
- **대안**: 노드별 토픽으로 분리
  ```java
  // 변경 전
  @SendTo("/topic/process")

  // 변경 후
  messagingTemplate.convertAndSend("/topic/process." + nodeId, payload);
  ```
  ```javascript
  // 브라우저에서 현재 노드만 구독
  stompClient.subscribe(`/topic/process.${nodeId}`, callback);
  ```

#### kill 타임아웃 없음
- **위치**: `ProcessTable.jsx`의 `killingPids` 상태
- **내용**: 에이전트가 응답하지 않으면 스피너가 영원히 돌아감
- **대안**: 5초 타이머 추가
  ```javascript
  const handleKill = useCallback((pid, name) => {
      setKillingPids(prev => new Set(prev).add(pid));
      setConfirmPid(null);
      onKill(pid, name);
      // 5초 후 응답 없으면 자동 실패 처리
      setTimeout(() => {
          setKillingPids(prev => { const s = new Set(prev); s.delete(pid); return s; });
          setToast({ message: `PID ${pid} 종료 응답 시간 초과`, type: 'warning' });
      }, 5000);
  }, [onKill]);
  ```

---

### 3.3 프론트엔드 개선

#### React ErrorBoundary 없음
- **문제**: 컴포넌트 렌더링 에러 시 전체 앱이 흰 화면으로 크래시
- **대안**: 최상위에 ErrorBoundary 추가, 폴백 UI 표시

#### WebSocket 재연결이 고정 간격
- **위치**: `DashBoard.jsx` — 3초 고정 간격 무한 재시도
- **문제**: 서버 장애 시 불필요한 연결 시도 폭주
- **대안**: 지수 백오프 (3초 → 6초 → 12초 → 최대 60초)

#### SideBar가 HTTP 폴링
- **위치**: `SideBar.jsx` — 5초마다 `GET /api/node/list`
- **문제**: 이미 WebSocket 연결이 있는데 별도 HTTP 폴링
- **대안**: 노드 상태 변경 시 WebSocket으로 푸시

#### TypeScript 미적용
- **문제**: prop 타입 오류를 런타임에서만 발견 가능
- **대안**: 점진적 TypeScript 마이그레이션 (`.jsx` → `.tsx`)

---

### 3.4 에이전트 개선

#### 프로세스 목록 크기 제한 없음
- **위치**: `process.py`의 `PROCESS_LIMIT = None`
- **문제**: 프로세스가 수백 개면 512KB STOMP 한도 초과 가능
- **대안**: 상위 100개만 전송하거나, 페이지네이션 적용

#### MonitoringService가 빈 클래스
- **위치**: `MonitoringService.java`
- **문제**: 사용되지 않는 빈 서비스 클래스가 존재
- **대안**: 삭제하거나 메트릭 히스토리 저장용으로 활용

---

## 4. 파일 구조 요약

### 백엔드 (30개 Java 파일)

```
backend/src/main/java/com/example/processmanager/
├── config/
│   ├── WebSocketConfig.java          # WebSocket/STOMP 설정
│   ├── WebSocketAuthInterceptor.java # 에이전트/브라우저 인증
│   ├── MybatisConfig.java            # MyBatis 설정
│   ├── SshTunnelConfig.java          # SSH 터널링
│   └── DatabaseMigrationConfig.java  # DB 마이그레이션
├── controller/
│   ├── ApiController.java            # STOMP 메시지 핸들러
│   ├── AuthController.java           # 토큰 갱신/로그아웃
│   ├── NodeController.java           # 노드 목록 REST API
│   └── UserController.java           # 사용자 토큰 관리
├── service/
│   ├── NodeService.java              # 노드 관리 핵심 로직
│   ├── ProcessCommandService.java    # kill 명령 전송
│   ├── UserService.java              # 사용자/토큰 관리
│   ├── RefreshTokenService.java      # Refresh Token 관리
│   └── MonitoringService.java        # (빈 클래스)
├── security/
│   ├── SecurityConfig.java           # Spring Security 설정
│   ├── JwtTokenProvider.java         # JWT 생성/검증
│   ├── JwtAuthenticationFilter.java  # JWT 인증 필터
│   └── OAuth2SuccessHandler.java     # OAuth2 로그인 성공 처리
├── entity/
│   ├── User.java
│   ├── Node.java
│   └── RefreshToken.java
├── dto/
│   ├── ProcessKillCommand.java       # 서버 → 에이전트
│   ├── ProcessKillResult.java        # 에이전트 → 서버
│   ├── NodeResponse.java
│   ├── NodeRegisterRequest.java
│   └── MonitoringDto.java
├── mapper/
│   ├── UserMapper.java
│   ├── NodeMapper.java
│   └── RefreshTokenMapper.java
└── ProcessManagerApplication.java
```

### 프론트엔드

```
frontend/src/
├── pages/
│   ├── Login.jsx                # 로그인 페이지
│   ├── Main.jsx                 # 메인 (프로필, 토큰, 노드 목록)
│   ├── DashBoard.jsx            # 대시보드 (WebSocket 연결)
│   └── OAuth2RedirectHandler.jsx
├── components/
│   ├── Header.jsx               # 탭 네비게이션
│   ├── SideBar.jsx              # 노드 목록 사이드바
│   ├── Monitoring.jsx           # 메트릭 카드
│   ├── MonitoringChart.jsx      # 실시간 차트 (Recharts)
│   ├── ProcessTable.jsx         # 프로세스 테이블 (정렬/필터/kill)
│   ├── Toast.jsx                # 알림 토스트
│   ├── ProtectedRoute.jsx       # 인증 라우트 가드
│   └── GoogleLoginButton.jsx
├── hooks/
│   └── useAuthFetch.js          # JWT 자동 주입 + Silent Refresh
├── context/
│   └── AuthContext.jsx          # 인증 상태 관리
└── App.jsx                      # 라우팅 설정
```

### 에이전트 (원격 서버)

```
/home/test/linuxApi/
├── main.py           # 단일 WebSocket 연결, 전체 통신 관리
├── api/
│   ├── monitoring.py # 시스템 메트릭 수집 (CPU, GPU, 메모리, 디스크, 네트워크)
│   └── process.py    # 프로세스 데이터 수집, kill 실행
├── config.py         # 환경변수 로딩, Settings 데이터클래스
├── .env              # ACCOUNT_TOKEN, SPRING_WS_URL 등
└── requirements.txt
```

---

## 5. 개선 우선순위

```
┌─────────────────────────────────────────────────────────────┐
│  1순위 (보안)                                                │
│  - 시크릿을 환경변수로 분리                                    │
│  - JWT URL 노출 수정 (fragment 방식 또는 code 교환)            │
│  - account-token에 만료 추가                                  │
├─────────────────────────────────────────────────────────────┤
│  2순위 (안정성)                                               │
│  - kill 타임아웃 추가 (5초)                                   │
│  - @Scheduled로 오프라인 노드 자동 감지                        │
│  - heartbeat 캐시 + 일괄 flush                               │
│  - WebSocket 재연결 지수 백오프                                │
├─────────────────────────────────────────────────────────────┤
│  3순위 (확장성)                                               │
│  - 노드별 프로세스 구독 분리 (/topic/process.{nodeId})         │
│  - 프로세스 목록 페이지네이션 또는 상위 N개 제한                 │
│  - SideBar를 WebSocket 푸시로 전환                            │
├─────────────────────────────────────────────────────────────┤
│  4순위 (코드 품질)                                            │
│  - React ErrorBoundary 추가                                  │
│  - TypeScript 점진적 마이그레이션                               │
│  - 서비스 레이어 단위 테스트 작성                               │
│  - 빈 MonitoringService 정리                                  │
└─────────────────────────────────────────────────────────────┘
```
