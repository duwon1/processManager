# ProcessManager 변경 이력

## v2.0.0 — 작업관리자 탭 추가 및 프로젝트 구조 정리 (2026-04-06)

### 신규 기능

#### 작업관리자 (TaskManager) 탭
- Windows 작업관리자 성능 탭과 동일한 레이아웃 구현
- CPU, 메모리, 디스크, 네트워크, GPU 5개 리소스를 실시간 모니터링
- 좌측 사이드바에 미니 그래프와 실시간 수치 표시 (PC), 모바일에서는 텍스트만 표시
- 우측 메인 영역에 60초 이력 차트 + 하드웨어 상세 정보 (StatsPanel) 표시
- 활성 시간(uptime) 실시간 카운터 (1초 갱신)
- 시스템 정보 자동 요청 (탭 진입 시) 및 30초 주기 자동 갱신
- 수동 새로고침 버튼 지원

#### 시스템 하드웨어 정보 수집 (에이전트)
- CPU: 모델명, 기본/현재 속도, 소켓, 코어, 논리 프로세서, 가상화, L1/L2/L3 캐시, 활성시간
- 메모리: 사용 중, 사용 가능, 캐시됨, 커밋됨/제한, 속도(dmidecode), 슬롯, 폼팩터
- 디스크: 읽기/쓰기 속도, 용량, 포맷됨, 파일시스템, 유형(SSD/HDD)
- 네트워크: 어댑터명, SSID, 연결 유형, IPv4, IPv6, 신호 강도
- GPU: 모델명, 드라이버 버전, 전용/공유 메모리 (NVIDIA / AMD / Intel 내장 자동 감지)

### 백엔드 변경

#### ApiController.java
- `handleSystemInfoRequest()` 추가 — 브라우저의 시스템 정보 요청을 검증 후 에이전트로 전달
- `handleSystemInfo()` 추가 — 에이전트가 수집한 정보를 브라우저로 relay
- `convertAndSend` 모호성 해결 — `Map.of()` 세 번째 인자 추가

#### NodeService.java
- `validateNodeAndGetName()` 추가 — 노드 소유권 검증 + 온라인 상태 확인 후 노드명 반환

### 프론트엔드 변경

#### DashBoard.jsx
- `TaskManager` 컴포넌트 탑재 및 탭 라우팅 (`?tab=task-manager`)
- `/topic/system-info` WebSocket 구독 추가
- `systemInfo` 자동 요청 로직 (isConnected 의존성 포함)
- 30초 주기 자동 갱신 타이머

#### TaskManager.jsx (신규)
- 5개 리소스 사이드바 + 메인 차트 + 스탯 패널 3단 구조
- Recharts AreaChart 기반 60초 이력 그래프
- 0s/60s X축 레이블 및 세로 그리드 라인
- 모바일(375px~) 반응형 지원 — 사이드바 flex:1 배분

#### SideBar.jsx
- 노드 목록 온라인(Y) 우선 정렬
- 프로젝트 로고 클릭 시 메인 페이지 이동
- 노드 목록 세로 스크롤 영역 추가 (max-height: 40vh)
- 긴 노드명 말줄임(text-truncate) 처리

#### Main.jsx
- 노드 목록 온라인 우선 정렬
- 노드/팀 목록을 2컬럼 그리드(col-xl-6)로 재배치
- 모바일 패딩 최적화 (p-2 p-md-4)

### 에이전트 변경

#### 구조 리팩토링
- 기존 단일 `main.py` (392줄) → 4개 모듈로 분리:
  - `main.py` (46줄) — FastAPI 앱 + 라이프사이클
  - `agent_runner.py` — WebSocket/STOMP 메인 루프
  - `stomp_utils.py` — STOMP 프레임 유틸
  - `terminal_manager.py` — PTY 터미널 세션 관리

#### system_info.py
- `_collect_gpu()`: NVIDIA → AMD(sysfs) → Intel/기타 순으로 자동 감지
- `_dmidecode_memory()`: sudo dmidecode로 메모리 하드웨어 정보 수집
- `run_in_executor`로 blocking 작업 비동기 처리 (ECONNRESET 방지)
- 불필요 필드 제거: `utilizationPct`, `physicalLocation`, `currentFreqMhz` (모니터링 스트림과 중복)
- `_intel_gpu_top_stats()` 함수 삭제 (더 이상 사용하지 않음)
- `import json`, `import threading` 제거

### 프로젝트 정리

#### 삭제된 파일
- `main_remote.py` (루트) — 원격 에이전트 임시 다운로드본
- `fix_main.py` (루트) — 일회성 버그 수정 스크립트
- `AGENTS.md` (루트) — 에이전트 설명 문서 (에이전트 별도 레포로 이관)
- `PROJECT_REVIEW.md` (루트) — 프로젝트 리뷰 임시 문서
- `agent/` (디렉토리 전체) — 로컬 에이전트 사본 (원격 서버 + 별도 git 레포로 관리)

### 기술 스택

| 구성 요소 | 기술 |
|-----------|------|
| 백엔드 | Spring Boot, WebSocket/STOMP, MyBatis |
| 프론트엔드 | React 18, Bootstrap 5 (Vapor 테마), Recharts, xterm.js |
| 에이전트 | Python 3, FastAPI, psutil, websockets |
| 통신 | STOMP over WebSocket (양방향 실시간) |
