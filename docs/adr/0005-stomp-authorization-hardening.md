# ADR-0005: STOMP 인가 강화 — SEND 화이트리스트와 구독 경로 검증

- **상태**: 채택
- **관련 코드**: `WebSocketAuthInterceptor`, `AgentInstallTokenService`, `NodeService`, `WebSocketConfig`
- **관련 ADR**: [0002](0002-agent-auth-install-token-and-secret.md), [0003](0003-dual-websocket-endpoints.md)

## 맥락

보안 회고에서 STOMP 채널에 다음 세 가지 인가 누락을 발견했다.

1. **클라이언트 SEND를 `/topic`으로 보내는 것을 막지 않았다.**
   simple broker는 `/topic/...`으로 들어온 SEND를 검사 없이 그 경로의 구독자에게 그대로 전달한다.
   로그인한 브라우저(또는 다른 노드의 에이전트)가 `/topic/agent.command.{agentId}`로 직접 SEND하면
   서버 컨트롤러의 권한 검사를 건너뛰고 대상 에이전트에 kill·터미널·업데이트·삭제 명령을 넣을 수 있었다.
2. **agentId 범위 구독에 와일드카드가 섞일 수 있었다.**
   에이전트 전용 채널(`/topic/agent.command.{agentId}` 등)은 "세션의 agentId와 경로 끝이 같은가"만 비교했다.
   agentId 형식을 강제하지 않아 `*` 같은 패턴 문자를 agentId로 등록하면 다른 노드의 명령 채널까지 받을 여지가 있었다.
3. **노드 topic 구독에 와일드카드 경로를 쓸 수 있었다.**
   `/topic/node.*.monitoring`처럼 패턴 문자가 들어간 구독이 들어오면 simple broker가 이를 패턴으로 해석해
   권한이 없는 노드의 모니터링·프로세스·터미널 출력까지 수신할 수 있었다. suffix 목록 검증도 없어
   알 수 없는 노드 하위 경로가 기본 허용되었다.
4. **SEND만 막고 다른 프레임은 열려 있었다.** (1차 수정 후 재검토에서 발견)
   클라이언트가 보낸 `MESSAGE` 프레임도 Spring에서 `SimpMessageType.MESSAGE`로 분류되어 simple broker가 구독자에게 그대로 전달했다.
   또 `STOMP` 프레임은 Spring이 `CONNECT`와 똑같이 처리하는데 인터셉터는 `CONNECT`만 인증해, `STOMP`로 접속하면 인증 없이 세션이 열렸다.
   두 가지를 합치면 SEND 화이트리스트를 그대로 우회할 수 있었다.

### 근본 원인

- 인가 모델이 **"구독은 검사, 발행은 컨트롤러가 검사"** 라는 가정에 기대고 있었다.
  그러나 simple broker 목적지(`/topic`)로의 SEND는 컨트롤러를 거치지 않으므로 이 가정이 성립하지 않는다.
- 구독 검증이 **거부 목록(blacklist) + 접두사 비교** 방식이라, 새 경로나 패턴 문자처럼 예상하지 못한 입력이
  기본 허용으로 떨어졌다.
- 브라우저 세션과 에이전트 세션이 같은 인터셉터를 지나지만, **주체별로 허용 목적지를 나누지 않았다.**

## 결정

`WebSocketAuthInterceptor`의 SEND/SUBSCRIBE 검증을 **허용 목록(whitelist) 기반, 기본 거부**로 바꾼다.

0. **클라이언트가 보낼 수 있는 프레임을 제한한다.**
   `CONNECT`, `STOMP`, `SUBSCRIBE`, `UNSUBSCRIBE`, `SEND`, `DISCONNECT`와 heartbeat만 통과시키고 `MESSAGE`·`ACK`·트랜잭션 프레임은 거부한다.
   `STOMP` 프레임은 `CONNECT`와 같은 인증을 거친다.
1. **SEND는 `/app/**`만 허용한다.**
   `/topic` 등 브로커 목적지로의 클라이언트 SEND는 전부 거부한다. 서버→구독자 발행은 서버 코드(`SimpMessagingTemplate`)만 한다.
2. **SEND 목적지를 주체별로 분리한다.**
   - 에이전트 세션 전용: `/app/monitoring`, `/app/process`, `/app/system-info`, `/app/terminal.output`, `/app/agent.*` 등.
   - 로그인한 브라우저 세션 전용: `/app/node.kill`, `/app/node.service-control`, `/app/terminal.open|input|resize|close` 등.
   - 목록에 없는 `/app` 경로, 주체가 맞지 않는 SEND(브라우저가 에이전트 경로로 보내거나 그 반대)는 거부한다.
3. **agentId는 UUID 형식만 허용한다.**
   설치 토큰 claim·consume(`AgentInstallTokenService`)과 노드 등록·재접속(`NodeService.registerAgent`, `connectRegisteredAgent`)에서
   agentId가 UUID 정규식에 맞지 않으면 거부하므로, 등록된 노드의 agentId에는 패턴 문자가 들어갈 수 없다.
   에이전트 전용 채널은 세션의 agentId와 **정확히 일치**할 때만 구독을 허용한다.
4. **구독 경로의 와일드카드를 거부한다.**
   `*`, `?`, `{`, `}`가 들어간 구독은 경로와 무관하게 즉시 거부한다.
5. **노드 topic은 명시적 suffix 목록만 허용한다.**
   `/topic/node.{id}.{suffix}`의 suffix별로 필요한 권한(`NodeAccessPermission`)을 매핑하고, 목록에 없는 suffix는 거부한다.
   터미널 출력(`terminal.output.{sessionId}`)은 TERMINAL 권한을 요구한다. `/topic/user.{id}`는 본인 id만 허용한다.
6. 위 어느 규칙에도 해당하지 않는 `/topic` 구독은 **기본 거부**한다.

## 검증(테스트)

단위 테스트로 고정한 시나리오:

- `WebSocketAuthInterceptorTests`
  - 브라우저/에이전트 세션이 `/topic/...`으로 SEND → 거부.
  - 클라이언트 `MESSAGE`·`ACK`·`BEGIN` 프레임 → 거부. 인증 헤더 없는 `STOMP` 프레임 → 거부. heartbeat → 허용.
  - 브라우저 세션이 에이전트 전용 `/app` 경로로 SEND, 에이전트 세션이 브라우저 전용 경로로 SEND → 거부.
  - 목록에 없는 `/app/...` 경로 SEND → 거부.
  - `/topic/node.*.monitoring` 등 패턴 문자가 든 구독, 목록에 없는 suffix 구독 → 거부.
- `AgentInstallTokenServiceTests`: UUID가 아닌 agentId로 consume → 거부, `isValidAgentId` 형식 검사.

테스트로 고정하지 않아 수동 STOMP 클라이언트로 확인할 항목:

- 에이전트가 다른 agentId의 `/topic/agent.command.{otherId}` 구독 → 거부, 자기 agentId 구독 → 허용.

## 결과

**장점**
- 브로커 목적지로의 직접 발행 경로가 사라져, 명령은 반드시 권한 검사가 있는 `/app` 컨트롤러를 거친다.
- 기본 거부라 새 경로를 추가해도 등록 전까지는 열리지 않는다. (실수로 열리는 방향이 아니라 막히는 방향으로 실패)
- 에이전트와 브라우저의 권한 경계가 목적지 목록으로 코드에 드러난다.

**단점 / 비용**
- 새 STOMP 목적지를 추가할 때마다 인터셉터의 허용 목록(SEND 목록 또는 노드 suffix 매핑)을 함께 갱신해야 한다.
- 구버전 에이전트가 쓰던 전역 채널(`/topic/agent.command`, `/topic/agent.sysinfo-request`) 구독은
  호환을 위해 에이전트 세션에 한해 남겨 두었고, 서버는 그 채널로 더 이상 명령을 보내지 않는다.
- 인메모리 simple broker 특성상 이 검증은 단일 인스턴스를 전제로 한다. (README의 운영 제약 참고)
