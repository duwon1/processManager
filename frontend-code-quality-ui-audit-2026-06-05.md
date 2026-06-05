# Frontend 수정 후 코드 품질 및 UI 재검증 리포트

- 대상: `E:\processManager\frontend`
- 작성일: 2026-06-05
- 범위: 기존 frontend 코드 품질/UI 리스크 9건 처리 및 재검증

## 검증 요약

| 항목 | 결과 |
|---|---|
| `npm run lint` | 통과 |
| `npm run build` | 통과 |
| `npm audit --audit-level=moderate` | 통과, 0 vulnerabilities |
| React Router | `react-router-dom@7.17.0`, `react-router@7.17.0` |
| UI smoke | `/main?accessToken=not-oauth`, `/oauth2/redirect?accessToken=query-token` 모두 로그인 화면 렌더링 |

## 이슈 처리 현황

### 1. OAuth 경로가 아닌 URL의 `accessToken` blank screen

- 상태: 해결
- 변경:
  - `AuthContext.jsx`에서 auth refresh skip 조건을 `/oauth2/redirect` 경로로 제한했습니다.
  - `/main?accessToken=not-oauth` smoke에서 로그인 화면 렌더링을 확인했습니다.

### 2. query string access token 수신

- 상태: 해결
- 변경:
  - `OAuth2RedirectHandler.jsx`가 fragment `#accessToken=`만 소비하도록 변경했습니다.
  - `/oauth2/redirect?accessToken=query-token` smoke에서 token을 로그인으로 처리하지 않고 `/login` 화면으로 이동하는 것을 확인했습니다.

### 3. 메인 진입 직후 동일 API 중복 호출

- 상태: 해결
- 변경:
  - `AppDataContext.jsx`를 추가해 `/api/node/list`, `/api/team/list`, `/api/user/me` 조회를 한 곳으로 모았습니다.
  - `SideBar`, `Main`, `Header`, `NotificationContext`는 공통 profile/node/team state를 읽습니다.
  - 5초 polling은 AppDataProvider 한 곳에서만 수행합니다.

### 4. 팀 상세 조회 race condition

- 상태: 해결
- 변경:
  - `Teams.jsx`에 request sequence ref를 추가했습니다.
  - 늦게 도착한 이전 팀 응답은 현재 state에 반영하지 않습니다.

### 5. Dashboard WebSocket 재연결 중복

- 상태: 해결
- 변경:
  - reconnect 예약 전 기존 timer를 clear합니다.
  - 실패한 stale client를 deactivate하고 ref를 비워 단일 reconnect만 유지합니다.

### 6. 서비스 제어 결과 timeout cleanup

- 상태: 해결
- 변경:
  - service-control result timeout id를 보관하고, 새 결과/언마운트 시 clear합니다.
  - timeout 내부에서 mounted 여부를 확인합니다.

### 7. 알림 규칙 대상 노드 의미 불일치

- 상태: 해결
- 변경:
  - 특정 노드 선택 목록과 전체 선택 대상을 `ownedNodes`로 제한했습니다.
  - 화면 문구의 "전체 내 노드" 의미와 실제 선택 가능 대상이 일치합니다.

### 8. 설치 명령어 새로고침 문구 불일치

- 상태: 해결
- 변경:
  - 새로고침 후 명령어가 화면에 다시 표시되지 않는 실제 동작에 맞게 안내 문구를 수정했습니다.
  - 서버에 미사용 토큰 재조회 API를 새로 만들지는 않았습니다.

### 9. 프로세스/서비스 관리자 높이 고정 리스크

- 상태: 해결
- 변경:
  - Dashboard table tab의 부모 세로 스크롤을 허용했습니다.
  - `.pm-manager-shell`의 고정 `height: calc(100vh - 160px)`를 제거하고 responsive max-height로 바꿨습니다.

## 남은 확인 필요

- 실제 backend와 agent를 붙인 상태의 dashboard 데이터, terminal, process kill, service control, device-manager E2E는 아직 별도 통합 환경이 필요합니다.
- 대형 컴포넌트 완전 분해는 별도 리팩터링으로 남깁니다.
