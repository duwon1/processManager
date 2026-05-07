# Security Threat Checklist

## Completed

- [x] 팀 공유 노드 권한을 기능별로 분리한다.
- [x] WebSocket 구독/명령 경로에서 사용자, 노드, 기능별 권한을 검사한다.
- [x] `/teams`에서 팀원별 권한과 프리셋을 설정할 수 있게 한다.
- [x] 에이전트 설치/업데이트 sudo 권한에서 `NOPASSWD: ALL`을 제거한다.
- [x] 에이전트 sudoers를 서비스 관리, 제한된 `dmidecode`, 터미널 사용자 전환 명령으로 축소한다.
- [x] 웹 터미널을 에이전트 서비스 계정과 분리된 저권한 사용자로 실행한다.
- [x] 정보 수집용 `dmidecode` 권한을 에이전트 서비스 사용자에게만 제한한다.
- [x] 서버 에러 응답을 `ProblemDetail`로 표준화한다.
- [x] 5xx/DB 예외 메시지와 stacktrace가 사용자에게 노출되지 않게 한다.
- [x] 프론트엔드에서 API 에러를 안전한 사용자 메시지로 매핑한다.
- [x] 팀 초대 시 가입자/미가입자 여부가 응답으로 구분되지 않게 한다.
- [x] 자기 자신 초대를 차단한다.
- [x] 장기 `account_token` 기반 에이전트 신규 등록 흐름을 제거한다.
- [x] 에이전트 신규 등록을 5분 만료 1회용 설치 토큰으로 처리한다.
- [x] 설치 토큰을 최대 2번까지 남은 시간 5분으로 갱신할 수 있게 한다.
- [x] 새 설치 토큰 발급 시 기존 미사용 설치 토큰을 폐기한다.
- [x] 설치 토큰 원문을 DB에 저장하지 않고 해시만 저장한다.
- [x] 설치 토큰 사용 시 `used_at`을 기록해 재사용을 막는다.
- [x] 노드 등록 후에는 노드별 `agent_secret`으로 재접속한다.
- [x] 에이전트가 `agent_secret` 저장 후 로컬 `ACCOUNT_TOKEN` 값을 비운다.
- [x] refresh token을 원문이 아니라 salt + hash로 저장한다.
- [x] refresh token cookie에 `HttpOnly`, `Secure`, `SameSite=Lax`를 적용한다.
- [x] access token을 프론트 localStorage가 아니라 메모리에만 저장한다.
- [x] OAuth redirect에서 access token을 query가 아니라 fragment로 전달한다.
- [x] 운영 비밀번호와 OAuth/Gmail secret을 환경변수 또는 배포 시크릿으로 주입한다.

## Partial

- [ ] 터미널 권한을 가진 사용자 세션 탈취 시 해당 노드 명령 실행 위험을 추가로 줄인다.
- [ ] 터미널 열기, 프로세스 종료, 서비스 제어에 최근 재인증 또는 강한 확인 절차를 붙인다.
- [ ] 터미널 실행 환경을 chroot, container, systemd sandboxing 중 하나로 더 격리한다.
- [ ] 운영용 노드는 별도 계정과 최소 권한 기준으로 설치하도록 문서화한다.

## Pending

- [ ] WebSocket connect rate limit을 추가한다.
- [ ] 설치 토큰 생성/검증 rate limit을 추가한다.
- [ ] refresh token 재발급 rate limit을 추가한다.
- [ ] 팀 초대 rate limit을 추가한다.
- [ ] 노드 명령 요청 rate limit을 추가한다.
- [ ] STOMP 메시지별 빈도 제한을 추가한다.
- [ ] Content-Security-Policy를 추가한다.
- [ ] 보안 응답 헤더를 정리한다.
- [ ] React `dangerouslySetInnerHTML` 사용 여부를 정기 점검한다.
- [ ] 사용자 입력 출력 시 escape/sanitize 원칙을 유지하는 테스트를 추가한다.
- [ ] 마이그레이션을 Flyway 또는 Liquibase로 일원화한다.
- [ ] 운영 DB 마이그레이션 실패 시 앱 시작을 실패 처리한다.
- [ ] 운영 프로필의 `spring.sql.init.mode`를 `never`로 전환한다.
- [ ] 에이전트 설치/업데이트 버전을 태그 또는 커밋 SHA로 고정한다.
- [ ] 에이전트 릴리스 아티팩트 checksum 또는 서명 검증을 추가한다.
- [ ] GitHub Actions 액션 버전을 고정한다.
- [ ] Docker base image를 버전 태그 또는 digest로 고정한다.
- [ ] 자동 업데이트는 owner가 확인한 버전만 적용되도록 제한한다.
- [ ] Gmail refresh token 회전 절차를 문서화한다.
- [ ] Gmail OAuth client secret 노출 의심 시 회전 절차를 문서화한다.
