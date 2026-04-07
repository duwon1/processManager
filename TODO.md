# TODO - Process Manager

## 다음 작업 (우선순위순)

### 1. 서비스 관리 탭
- [ ] 에이전트: `systemctl list-units --type=service` 기반 서비스 목록 수집 API
- [ ] 에이전트: 서비스 start / stop / restart / enable / disable 명령 API
- [ ] 에이전트: sudoers NOPASSWD 설정 (`/bin/systemctl`)
- [ ] 백엔드: 서비스 목록 STOMP 채널 추가
- [ ] 백엔드: 서비스 제어 명령 라우팅
- [ ] 프론트엔드: 서비스 탭 UI (테이블 + 상태 표시 + 제어 버튼)

### 2. 팀 관리
- [ ] DB: teams, team_members, team_nodes 테이블 설계
- [ ] 백엔드: 팀 CRUD API
- [ ] 백엔드: 팀 멤버 초대/제거
- [ ] 백엔드: 노드 공유 권한 체계
- [ ] 프론트엔드: 메인 화면 팀 목록 UI
- [ ] 프론트엔드: 팀 생성/관리 모달

### 3. 알림 시스템
- [ ] 백엔드: 임계값 설정 테이블 (CPU > 90%, 메모리 > 80% 등)
- [ ] 백엔드: 임계값 초과 시 알림 트리거
- [ ] 프론트엔드: 알림 설정 UI
- [ ] 프론트엔드: 실시간 알림 토스트/벨 아이콘

### 4. 감사 로그
- [ ] DB: audit_logs 테이블
- [ ] 백엔드: 주요 액션 로깅 (kill, 서비스 제어, 로그인 등)
- [ ] 프론트엔드: 로그 조회 UI

### 5. 기타
- [ ] SSH 헬퍼 스크립트 (`scripts/ssh-agent.js`) 작성
- [ ] Windows 에이전트 지원
- [ ] 대시보드 커스터마이징 (위젯 순서 변경)
- [ ] 노드 간 성능 비교 뷰
