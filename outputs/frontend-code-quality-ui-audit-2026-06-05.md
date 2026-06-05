# Frontend 코드 품질 및 UI 기능 리스크 분석

- 대상: `E:\processManager\frontend`
- 범위: React/Vite 프론트엔드의 라우팅, 인증 토큰 처리, 주요 페이지/컴포넌트, API 호출, 상태 관리, 렌더링/반응형 리스크
- 작성일: 2026-06-05
- 코드 수정: 없음

## 검증 요약

- `npm run lint`: 통과
- `npm run build -- --outDir %TEMP%\processManager-vite-build-audit --emptyOutDir`: 통과
- UI 확인: Vite dev server `http://127.0.0.1:5173/` 실행 후 Chrome headless/CDP로 확인
- 확인한 화면: `/`, `/login`, 더미 OAuth 토큰 기반 `/main`, `/dashboard/1?tab=process`, `/settings/teams`
- 제한: 백엔드가 실행 중이 아니어서 `/api/*` 요청은 Vite 프록시 502로 실패했습니다. 따라서 실제 데이터가 있는 대시보드/팀/알림 CRUD 흐름은 정적 분석과 제한적 렌더링 확인으로 판단했습니다.

## 이슈

### 1. OAuth 경로가 아닌 URL에 `accessToken` 문자열이 있으면 앱이 빈 화면에 멈춤

- 파일: `frontend/src/context/AuthContext.jsx:70-73`
- 우선순위: P1
- 영향: `/main?accessToken=...`, `/login?foo=accessToken`처럼 OAuth 콜백이 아닌 경로에서도 초기 인증 확인이 종료되지 않습니다. `isAuthChecking`이 계속 `true`라 `RootRedirect`/`ProtectedRoute`가 아무것도 렌더링하지 않아 사용자는 빈 화면을 보게 됩니다.
- 근거: `AuthProvider`의 초기 effect가 `window.location.search.includes('accessToken') || window.location.hash.includes('accessToken')`이면 바로 `return`하지만, 이 경우 `setIsAuthChecking(false)`를 호출하지 않습니다. 브라우저에서 `http://127.0.0.1:5173/main?accessToken=not-oauth` 접속 시 `document.body.innerText`가 빈 문자열로 재현됐습니다.
- 검증 아이디어: `/main?accessToken=not-oauth`, `/login?next=accessToken`로 직접 진입하는 테스트를 추가하고, 로그인 페이지 또는 안전한 리다이렉트가 렌더링되는지 확인합니다.

### 2. 액세스 토큰을 query string에서도 받는 흐름은 토큰 노출과 라우팅 오동작 리스크가 큼

- 파일: `frontend/src/pages/OAuth2RedirectHandler.jsx:11-18`, `frontend/src/context/AuthContext.jsx:72`
- 우선순위: P1
- 영향: `?accessToken=` 방식은 브라우저 주소, 히스토리, 프록시/서버 로그, 리퍼러 정책 실수에 토큰이 남을 수 있습니다. 또한 위 1번처럼 전역 `accessToken` 문자열 검사와 결합되어 OAuth 경로 밖의 URL도 인증 대기 상태로 묶습니다.
- 근거: `OAuth2RedirectHandler`가 hash뿐 아니라 search parameter에서도 토큰을 읽습니다. `AuthContext`도 현재 path가 `/oauth2/redirect`인지 확인하지 않고 search/hash 전체에서 문자열 포함 여부만 검사합니다.
- 검증 아이디어: 백엔드 OAuth 성공 리다이렉트가 fragment 또는 authorization code 기반인지 확인하고, query token을 제거했을 때 로그인/리다이렉트 E2E가 통과하는지 확인합니다. 최소한 `pathname === '/oauth2/redirect'`일 때만 초기 refresh를 건너뛰는 테스트가 필요합니다.

### 3. 메인 진입 직후 동일 API가 여러 컴포넌트에서 중복 호출됨

- 파일: `frontend/src/components/SideBar.jsx:51-59`, `frontend/src/pages/Main.jsx:98-106`, `frontend/src/components/Header.jsx:20-34`, `frontend/src/context/NotificationContext.jsx:23-46`, `frontend/src/context/NotificationContext.jsx:48-76`
- 우선순위: P2
- 영향: 메인 화면에서 노드/팀/사용자/알림 API가 여러 소스에서 동시에 호출됩니다. 사용자 수와 탭 수가 늘면 백엔드 부하, refresh-token 재발급 경합, 모바일 배터리/네트워크 비용이 커질 수 있습니다.
- 근거: `SideBar`와 `Main`이 각각 5초 간격으로 `/api/node/list`, `/api/team/list`를 폴링합니다. `Header`와 `NotificationContext`도 `/api/user/me`를 별도로 호출합니다. 더미 인증 상태에서 `/main` 진입 후 약 2.2초 동안 `/api/user/me` 7회, `/api/node/list` 4회, `/api/team/list` 4회, 알림 API 6회 등 총 21건의 API 요청이 관찰됐습니다. 개발 모드 StrictMode가 일부를 증폭할 수 있지만, 중복 호출 경로 자체는 코드에 존재합니다.
- 검증 아이디어: MSW 또는 테스트 서버로 `/main` 진입 후 3초간 endpoint별 호출 수를 측정합니다. 공통 캐시/컨텍스트를 도입한다면 동일 시간대 호출 수가 한 번으로 줄었는지 확인합니다.

### 4. 팀 상세 조회 응답 레이스로 이전 팀의 멤버/노드가 현재 팀 화면에 표시될 수 있음

- 파일: `frontend/src/pages/Teams.jsx:79-107`, `frontend/src/pages/Teams.jsx:114-123`
- 우선순위: P1
- 영향: 사용자가 팀 A를 선택한 직후 팀 B로 빠르게 전환하면, 늦게 도착한 팀 A의 상세 응답이 팀 B의 `teamMembers`, `nodeOptions`, `selectedNodeIds`를 덮을 수 있습니다. 권한 수정/노드 공유 같은 작업이 잘못된 팀 컨텍스트에서 보이는 리스크가 있습니다.
- 근거: `refreshTeamDetail(teamId, canLoadNodes)`가 `Promise.all` 이후 현재 선택 팀이 여전히 같은지 확인하지 않고 state를 갱신합니다. effect cleanup 또는 요청 취소도 없습니다.
- 검증 아이디어: 네트워크 지연을 걸고 팀 A 선택 후 즉시 팀 B를 선택하는 E2E를 작성합니다. 마지막으로 선택된 팀 ID와 표시된 멤버/노드 응답의 teamId가 항상 일치하는지 검증합니다.

### 5. Dashboard WebSocket 재연결 로직이 중복 연결/구독을 만들 수 있음

- 파일: `frontend/src/pages/DashBoard.jsx:445-459`, `frontend/src/pages/DashBoard.jsx:467-475`
- 우선순위: P2
- 영향: `onStompError`, `onWebSocketError`, `onWebSocketClose`가 짧은 간격으로 연속 발생하면 재연결 타이머가 여러 개 예약될 수 있습니다. 그 결과 같은 노드 토픽을 중복 구독하거나 오래된 client가 남아 실시간 데이터가 중복 반영될 수 있습니다.
- 근거: `scheduleReconnect`는 기존 `reconnectTimerId`를 clear하지 않고 새 timeout으로 덮어씁니다. 실패한 `stompClient`를 deactivate하지 않은 상태에서 `connect()`를 다시 호출할 수 있습니다.
- 검증 아이디어: STOMP 서버를 mock 처리해 error/close 이벤트를 연속 발생시키고, 10초 뒤 활성 client 수와 subscribe 호출 횟수가 1회인지 확인합니다.

### 6. 서비스 제어 결과 제거 timeout이 노드/컴포넌트 생명주기에 묶여 있지 않음

- 파일: `frontend/src/pages/DashBoard.jsx:411-421`
- 우선순위: P3
- 영향: 서비스 제어 결과를 받은 뒤 3초 안에 노드를 바꾸거나 대시보드를 벗어나면, 이전 timeout이 새 화면의 `serviceControlResult`를 지우거나 unmount 이후 state 갱신을 시도할 수 있습니다.
- 근거: subscription callback 안에서 `setTimeout(() => setServiceControlResult(null), 3000)`을 바로 호출하고, timeout id를 저장/정리하지 않습니다. `mounted` 검사는 timeout 내부에 적용되지 않습니다.
- 검증 아이디어: 서비스 제어 성공 직후 3초 이내 다른 노드로 이동하고, 새 노드의 결과 메시지가 이전 timeout에 의해 사라지지 않는지 확인합니다.

### 7. 알림 규칙의 특정 노드 선택 UI가 "내 노드"와 "팀 노드" 의미를 섞음

- 파일: `frontend/src/pages/NotificationRules.jsx:80`, `frontend/src/pages/NotificationRules.jsx:151-154`, `frontend/src/pages/NotificationRules.jsx:447-463`
- 우선순위: P2
- 영향: 화면 문구는 "전체 내 노드"를 기준으로 설명하지만, 특정 노드 선택 목록은 `nodes.map`을 사용해 팀 노드까지 표시합니다. 백엔드가 팀 노드 규칙 생성을 거부하면 사용자는 저장 실패를 겪고, 허용한다면 "내 노드"라는 요약과 실제 대상이 달라집니다.
- 근거: `ownedNodes`를 계산하지만 목록 렌더링에는 사용하지 않습니다. 목록에는 `!node.owner && <em>팀</em>` 표시가 있어 팀 노드가 선택 가능함을 보여줍니다.
- 검증 아이디어: 내 노드 1개와 팀 노드 1개가 있는 계정으로 알림 규칙 생성 화면을 열어, 특정 노드 목록/저장 payload/백엔드 응답이 제품 의도와 일치하는지 확인합니다.

### 8. 설치 명령어가 새로고침 후에도 유효하다는 문구와 실제 프론트엔드 상태가 맞지 않음

- 파일: `frontend/src/pages/Main.jsx:54-56`, `frontend/src/pages/Main.jsx:170-178`, `frontend/src/pages/Main.jsx:338-340`
- 우선순위: P2
- 영향: 화면은 "이 화면을 닫거나 새로고침해도 명령어는 만료 전까지 유효합니다"라고 안내하지만, 프론트엔드는 `installToken`과 만료 시간을 컴포넌트 state에만 보관합니다. 새로고침하면 명령어 표시가 사라져 사용자는 아직 유효한 명령어를 복사할 수 없습니다.
- 근거: 설치 토큰 state는 `useState`로만 관리되고, mount 시 기존 미사용 토큰을 조회하거나 sessionStorage 등에 복원하는 흐름이 없습니다.
- 검증 아이디어: 설치 명령어 생성 후 새로고침하고, 만료 전 명령어가 다시 표시되는지 또는 문구가 실제 동작과 일치하도록 변경됐는지 확인합니다.

### 9. 프로세스/서비스 관리자 높이가 고정 계산식에 의존해 작은 화면에서 잘릴 수 있음

- 파일: `frontend/src/App.css:1521-1523`, `frontend/src/pages/DashBoard.jsx:587`
- 우선순위: P3
- 영향: `.pm-manager-shell`이 `height: calc(100vh - 160px)`로 고정되어 있어, 모바일에서 헤더/탭/툴바가 줄바꿈되거나 브라우저 viewport가 작을 때 내부 리스트가 예상보다 작아지거나 일부 컨트롤이 잘릴 수 있습니다.
- 근거: 대시보드 main은 탭에 따라 `overflow-y-hidden`/`overflow-hidden`을 적용하고, 프로세스/서비스 내부 shell은 viewport 기준 고정 높이를 씁니다. 실제 데이터가 있는 상태의 모바일 테이블/카드는 백엔드 부재로 확인하지 못했습니다.
- 검증 아이디어: 모바일 viewport(예: 360x640)와 프로세스 50개/서비스 50개 mock 데이터를 넣고, 검색창/필터/첫 행/마지막 행/제어 버튼이 모두 접근 가능한지 스크린샷과 스크롤 검증을 수행합니다.

## 긍정적으로 확인된 부분

- 라우팅 구조는 공개 라우트와 보호 라우트가 명확히 나뉘어 있습니다.
- 액세스 토큰을 localStorage에 저장하지 않고 메모리 state에 보관하는 방향은 적절합니다.
- `useAuthFetch`는 동시 401 발생 시 refresh 요청을 하나로 합치는 전역 `refreshPromise`를 둔 점이 좋습니다.
- 로그인, 메인 빈 데이터 상태, 대시보드 접근거부, 팀 관리 모바일 빈 상태는 확인한 viewport에서 가로 오버플로우 없이 렌더링됐습니다.

## 추가 확인 필요

- 백엔드와 에이전트를 함께 띄운 상태에서 실제 WebSocket 대시보드, 터미널, 서비스 제어, 장치 관리자 데이터를 넣은 UI 검증이 필요합니다.
- 팀/알림 규칙/설치 토큰은 실제 API 응답 지연과 실패 응답을 mock으로 제어하는 테스트가 있으면 위 레이스와 상태 불일치를 안정적으로 재현할 수 있습니다.
