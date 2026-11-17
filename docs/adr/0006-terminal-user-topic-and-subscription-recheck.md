# ADR-0006: 터미널 출력을 사용자 topic으로, 구독 권한은 주기적으로 재확인

- **상태**: 채택
- **관련 코드**: `TerminalService`, `TerminalWebSocketController`, `NodeSubscriptionGuard`, `WebSocketAuthInterceptor`, `frontend/src/components/Terminal.jsx`, `frontend/src/pages/DashBoard.jsx`
- **관련 ADR**: [0003](0003-dual-websocket-endpoints.md), [0005](0005-stomp-authorization-hardening.md)

## 맥락

[ADR-0005](0005-stomp-authorization-hardening.md) 이후에도 실시간 채널에 세 가지 문제가 남아 있었다.

1. **터미널 세션 ID를 브라우저가 만들었다.**
   출력 topic이 `/topic/node.{id}.terminal.output.{sessionId}`였고, 구독 조건은 "그 노드의 TERMINAL 권한"뿐이었다.
   같은 노드의 터미널 권한을 가진 다른 사용자가 세션 ID를 알아내면 남의 터미널 출력을 구독할 수 있었다.
   ID가 `Date.now()`와 `Math.random()`으로 만들어져 추측을 완전히 배제할 수도 없었다.
2. **구독 권한을 SUBSCRIBE 때 한 번만 검사했다.**
   simple broker는 한 번 등록된 구독에 계속 메시지를 보낸다. 팀에서 빠지거나 권한이 낮아져도
   연결을 유지하는 동안에는 모니터링·프로세스 데이터를 계속 받을 수 있었다.
3. **터미널 키 입력이 몇 초 늦게 표시됐다.**
   키 입력마다 DB로 권한을 조회했고, 터미널 탭을 보는 동안에도 1초마다 오는 프로세스 목록을 계속 받았다.

## 결정

1. **터미널 세션 ID는 서버가 발급한다.**
   브라우저는 `/app/terminal.open`에 `requestId`만 보낸다. 서버가 UUID로 세션 ID를 만들고
   `{ requestId, sessionId }`를 요청자에게 알려 준 뒤 에이전트에 시작 명령을 보낸다.
2. **터미널 출력은 사용자 topic(`/topic/user.{userId}.terminal`)으로만 보낸다.**
   사용자 topic은 본인만 구독할 수 있으므로, 세션 ID를 알아도 다른 사용자는 출력을 받을 수 없다.
   노드 topic의 `terminal.output.*` suffix는 허용 목록에서 뺀다.
   세션 ID 발급 통지도 같은 topic으로 먼저 보내, 브라우저가 첫 출력을 놓치지 않게 한다.
3. **구독 권한을 10초마다 다시 확인한다.**
   `NodeSubscriptionGuard`가 구독 검사를 통과한 (세션, 노드, 권한)을 기록해 두고, 10초마다 DB로 다시 확인한다.
   권한이 사라졌으면 STOMP `ERROR` 프레임을 보내 그 WebSocket 세션을 닫는다.
   터미널은 입력·출력 경로에서 세션당 10초에 한 번만 권한을 다시 확인한다. (키 입력마다 조회하지 않음)
4. **프로세스 목록은 필요한 탭에서만 구독한다.**
   대시보드는 프로세스·작업관리자 탭을 볼 때만 `/topic/node.{id}.process`를 구독한다.

## 검토한 대안

- **권한이 바뀌는 지점마다 해당 사용자의 구독을 끊는다.**
  즉시 반영되지만, 팀원 삭제·권한 변경·노드 공유 해제·팀 삭제·노드 삭제마다 코드를 넣어야 한다.
  하나라도 빠뜨리면 그 경로가 구멍이 되므로, 경로와 무관하게 DB 기준으로 다시 확인하는 방식을 골랐다.
- **특정 구독만 서버에서 해제한다.**
  simple broker에는 서버가 구독 하나를 해제하는 공개 API가 없다. 세션을 닫으면 브라우저가 재연결하면서
  노드 목록을 다시 받아 화면 상태까지 맞춰지므로 세션 종료를 택했다.
- **터미널 출력은 노드 topic에 두고, 구독 때 세션 소유자를 확인한다.**
  구독이 세션 생성보다 먼저 와야 첫 출력을 놓치지 않는데, 그러면 구독 시점에는 확인할 소유자가 없다.
  열기를 두 단계로 나누면 가능하지만 메시지 종류가 늘어나 사용자 topic 방식보다 복잡하다.

## 검증(테스트)

- `TerminalServiceTests`: 서버가 세션 ID를 발급하고 요청자의 사용자 topic으로만 알림, 출력은 소유자 topic으로만 전송, 소유자가 아닌 사용자의 입력 무시, 10초 안에는 DB를 다시 조회하지 않음, 회수 후에는 세션을 닫음.
- `TerminalWebSocketControllerTests`: 브라우저가 보낸 `sessionId`는 무시하고 `requestId`로 열기, `requestId`가 없으면 거부.
- `WebSocketAuthInterceptorTests`: 노드 topic의 `terminal.output.*` 구독 거부, 통과한 구독을 기록하고 연결이 끊기면 지움.
- `NodeSubscriptionGuardTests`: 권한이 남아 있으면 유지, 회수되면 `ERROR` 프레임 전송, DB 조회가 실패하면 끊지 않고 다음 주기에 다시 확인.
- `NodeSubscriptionGuardIntegrationTests`: 실제 SockJS/STOMP 연결로 구독한 뒤 권한을 없애면 서버가 연결을 닫고 이후 데이터가 오지 않음.

## 결과

**장점**
- 터미널 출력은 세션을 연 사용자에게만 간다. 세션 ID는 비밀값이 아니어도 된다.
- 권한이 바뀌는 경로가 늘어나도 실시간 채널의 회수 처리는 한 곳에서 이뤄진다.
- 터미널 입력 경로에서 키 입력마다 하던 DB 조회가 없어졌다.

**단점 / 비용**
- 권한 회수가 실시간 채널에 반영되기까지 최대 10초가 걸린다.
- 한 사용자가 여러 탭에서 터미널을 쓰면 각 탭이 다른 탭의 출력도 받고 `sessionId`로 걸러 낸다.
- 권한 일부만 회수돼도 그 세션 전체가 끊겼다가 다시 연결된다.
- 구독 중인 세션 수에 비례해 10초마다 DB 조회가 생긴다. 인메모리 기록이라 단일 인스턴스를 전제로 한다.
- 프로세스·작업관리자 탭으로 돌아오면 다음 수신 때까지 직전 목록이 보인다.
