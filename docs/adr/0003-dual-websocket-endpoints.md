# ADR-0003: 브라우저/에이전트 이중 WebSocket 엔드포인트

- **상태**: 채택
- **관련 코드**: `WebSocketConfig`, `WebSocketAuthInterceptor`, `SpaController`

## 맥락

실시간 모니터링·터미널·프로세스 제어를 위해 STOMP over WebSocket을 쓴다.
연결 주체가 성격이 다른 둘이다.

- **브라우저(React)**: 프록시·구형 브라우저 환경에서의 폴백이 필요할 수 있다.
- **Python 에이전트**: 순수 WebSocket 클라이언트로, SockJS 프로토콜을 쓰지 않는다.

## 결정

STOMP 엔드포인트를 두 개로 분리한다.

- `/ws` — 브라우저 전용, **SockJS** 활성화(폴백 지원).
- `/ws-native` — 에이전트 전용, **순수 WebSocket**. 핸드셰이크 인터셉터로 클라이언트 IP
  (`X-Forwarded-For` 우선)를 세션 속성에 저장한다.

공통 사항:

- 브로커 접두사 `/topic`(서버→구독자), 애플리케이션 접두사 `/app`(클라이언트→서버).
- 대용량 프레임(프로세스 목록·장치 인벤토리)을 위해 메시지/버퍼 한도를 4MB로 상향.
- 인증·구독 권한은 엔드포인트와 무관하게 `WebSocketAuthInterceptor` 한 곳에서 처리한다.
- `SpaController`는 명시된 React 경로만 포워딩한다. 와일드카드를 쓰면 `/ws-native`를
  가로채는 문제가 생기므로 의도적으로 열거 방식을 유지한다.

## 결과

**장점**
- 브라우저는 SockJS 폴백으로 호환성을, 에이전트는 오버헤드 없는 순수 WS를 각각 얻는다.
- 인증 로직이 인터셉터 한 곳에 모여 주체별 분기가 명확하다.

**단점 / 비용**
- 엔드포인트가 둘이라 CORS/Origin 허용을 두 곳에 적용해야 한다.
- SPA 포워딩이 와일드카드가 아니라, 새 프론트 라우트를 추가할 때 `SpaController`에 경로를 등록해야 한다.
