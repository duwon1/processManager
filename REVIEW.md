# Code Review - Process Manager

프로젝트 전체 코드 검사 결과 (2026-04-07)

---

## 프론트엔드

### 개선 필요

| 파일 | 항목 | 설명 | 심각도 |
|------|------|------|--------|
| DashBoard.jsx | 파일 크기 | 300줄+ 단일 파일에 WebSocket 연결, 데이터 상태, 탭 렌더링 모두 포함. 커스텀 훅으로 분리 권장 | 중 |
| ProcessTable.jsx | 파일 크기 | 2,600줄+. 검색/정렬/리사이즈/모바일 뷰가 한 파일. 서브 컴포넌트 분리 권장 | 중 |
| DashBoard.jsx | reconnect 로직 | SockJS 연결 실패 시 3초 후 재시도하지만 최대 재시도 횟수 제한 없음. 지수 백오프 + 최대 횟수 제한 권장 | 낮 |
| TaskManager.jsx | 그래프 높이 상태 | `graphHeight`가 컴포넌트 언마운트 시 초기화됨. localStorage로 사용자 설정 유지 권장 | 낮 |
| Monitoring.jsx | 하드코딩 필터 | `metrics.filter(d => d.id <= 6)` — 매직넘버. 상수로 분리 권장 | 낮 |

### 잘 된 점
- AuthContext + useAuthFetch 조합으로 토큰 관리가 깔끔함
- ProcessTable의 드래그 리사이즈, 컬럼 토글 기능 완성도 높음
- 반응형 레이아웃이 xs/sm/md/lg/xl/xxl 전 구간 대응
- WebSocket 재연결 자동화 잘 되어 있음

---

## 백엔드

### 개선 필요

| 파일 | 항목 | 설명 | 심각도 |
|------|------|------|--------|
| ApiController.java | 크기/책임 | 모니터링, 프로세스, 터미널, 시스템정보 핸들러가 한 컨트롤러에 집중. 도메인별 분리 권장 | 중 |
| MonitoringService.java | 미사용 | 빈 서비스 클래스. 향후 알림 로직 추가 예정이 아니면 삭제 또는 구현 필요 | 낮 |
| SecurityConfig | CORS | `APP_CORS_ALLOWED_ORIGINS` 설정이 운영 환경에서 와일드카드(`*`)가 아닌지 확인 필요 | 중 |
| WebSocketAuthInterceptor | 에러 로깅 | 인증 실패 시 상세 로그 부족. 토큰 일부 마스킹 후 로깅 추가 권장 | 낮 |
| schema.sql | 인덱스 | nodes 테이블에 `user_id` 인덱스 없음. 노드가 많아지면 성능 저하 가능 | 중 |

### 잘 된 점
- Refresh Token Rotation + Grace Period(10초) 구현으로 보안 우수
- 토큰 탈취 시도 감지 및 즉시 폐기 로직 견고함
- 매 요청마다 노드 소유권 검증
- SSH 터널링으로 DB 접근 보안 확보

---

## 에이전트 (Python)

### 개선 필요

| 파일 | 항목 | 설명 | 심각도 |
|------|------|------|--------|
| system_info.py | 디스크 속도 측정 | `time.sleep(0.5)` 블로킹 호출. monitoring.py에 델타 추적으로 이관 완료했으나 system_info.py 내부 스냅샷 코드는 잔존 | 낮 |
| system_info.py | collect() 블로킹 | `_collect_disk()`에서 0.5초 sleep. `run_in_executor`로 호출하고 있지만 개선 여지 있음 | 낮 |
| process.py | CPU 측정 방식 | `prime_cpu_percent()`에서 `time.sleep(0.1)` 블로킹. 2초 주기로 호출되어 큰 문제 없으나 비동기 전환 고려 | 낮 |
| agent_runner.py | 에러 처리 | 모든 예외를 catch하고 5초 후 재시도. 특정 에러(인증 실패 등)는 재시도 불필요 — 에러 유형별 분기 권장 | 중 |
| config.py | 비밀번호 평문 | `.env` 파일에 ACCOUNT_TOKEN이 평문으로 저장됨. 파일 권한(600) 확인 필요 | 중 |
| terminal_manager.py | 세션 정리 | 좀비 세션 감지 로직 없음. 장시간 유휴 세션 자동 종료 추가 권장 | 낮 |

### 잘 된 점
- asyncio 기반 비동기 구조로 단일 WebSocket에서 모니터링/프로세스/터미널 동시 처리
- PTY 기반 터미널 구현이 안정적
- STOMP 프로토콜 직접 구현으로 외부 의존성 최소화
- psutil 기반 크로스플랫폼 시스템 정보 수집

---

## 보안 점검

| 항목 | 상태 | 비고 |
|------|------|------|
| SQL Injection | **안전** | MyBatis 파라미터 바인딩 사용 |
| XSS | **안전** | React JSX 자동 이스케이프 |
| CSRF | **안전** | JWT Bearer 토큰 방식 (쿠키 기반 아님) |
| 인증 우회 | **안전** | 모든 API에 JWT 필터 적용 |
| 권한 상승 | **안전** | 노드 소유권 검증 일관적 |
| WebSocket 인증 | **안전** | account-token 검증 + JWT 검증 |
| 토큰 저장 | **양호** | Refresh Token은 SHA-256 해싱, Access Token은 메모리 |
| 에이전트 비밀 | **주의** | .env 파일 권한 확인 필요 (chmod 600) |

---

## 성능 고려사항

| 항목 | 현재 상태 | 권장 |
|------|----------|------|
| 모니터링 데이터 전송 | 2초 간격, 13개 항목 | 적절 |
| 프로세스 목록 | 2초 간격, 전체 전송 | 노드당 프로세스 수 많으면 diff 전송 고려 |
| WebSocket 메시지 크기 | 512KB 제한 | 적절 |
| DB 쿼리 | 인덱스 부족 (nodes.user_id) | 인덱스 추가 권장 |
| 프론트엔드 번들 | Vite 자동 최적화 | 코드 스플리팅 추가 고려 |

---

## 요약

### 즉시 조치 필요 (높음)
1. `nodes` 테이블 `user_id` 인덱스 추가
2. CORS 운영 환경 설정 확인
3. 에이전트 `.env` 파일 권한 설정 (chmod 600)

### 리팩토링 권장 (중간)
4. ApiController 도메인별 분리
5. DashBoard.jsx WebSocket 로직 커스텀 훅 분리
6. ProcessTable.jsx 서브 컴포넌트 분리
7. agent_runner.py 에러 유형별 재시도 분기

### 나중에 고려 (낮음)
8. graphHeight localStorage 저장
9. 모니터링 매직넘버 상수화
10. 유휴 터미널 세션 자동 종료
