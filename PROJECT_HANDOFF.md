# Process Manager 인수인계 문서

최종 정리일: 2026-04-30  
기준 저장소: `https://github.com/duwon1/processManager.git`  
기준 브랜치: `master`  
마지막 확인 원격 커밋: `2c7e7ee commit`

이 문서는 다른 PC에서 현재 프로젝트 맥락을 최대한 그대로 이어받기 위한 작업 인수인계 문서다. 비밀번호, GitHub 토큰, DB 비밀번호, OAuth secret 같은 민감정보 원문은 절대 적지 않는다.

## 1. 프로젝트 개요

Process Manager는 브라우저에서 원격 노드를 모니터링하고 관리하는 풀스택 애플리케이션이다.

- 프론트엔드: React 19, Vite 8, Bootstrap 5, Recharts, xterm.js
- 백엔드: Java 21, Spring Boot 4.0.3, MyBatis, MySQL/TiDB, WebSocket/STOMP
- 에이전트: 별도 저장소 `processManager-agent`, Python, FastAPI, psutil
- 배포: Fly.io 앱 `procmanager`
- 운영 도메인: `https://procmanager.fly.dev`
- 개발 프론트 기본 주소: `http://localhost:5173`
- 개발 백엔드 기본 주소: `http://localhost:8080`

기본 구조는 다음과 같다.

```text
브라우저 React
  <-> Vite proxy 또는 운영 정적 파일
Spring Boot 백엔드
  <-> STOMP WebSocket
Python 에이전트
  <-> OS 명령, psutil, PTY
Linux/Windows/macOS 노드
```

## 2. 다른 PC 적용 절차

```bash
git clone https://github.com/duwon1/processManager.git
cd processManager
```

필요 도구:

- Java 21
- Node.js 20 이상 권장
- npm
- Git
- Docker 또는 Fly CLI는 배포할 때만 필요

프론트엔드:

```bash
cd frontend
npm ci
npm run dev
```

백엔드:

```bash
cd backend
./gradlew bootRun
```

Windows PowerShell에서는 다음처럼 실행한다.

```powershell
cd backend
.\gradlew.bat bootRun
```

프론트에서 `ECONNREFUSED /api/...` 또는 `/ws/info` 프록시 오류가 나면 대부분 백엔드가 `localhost:8080`에서 실행 중이 아니거나 백엔드가 시작 실패한 상태다.

## 3. 환경변수

개발환경은 `backend/.env`를 사용한다. 값 원문은 각 PC에서 직접 넣는다.

```env
DB_USERNAME=
DB_PASSWORD=
JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_MAIL_CLIENT_ID=
GOOGLE_MAIL_CLIENT_SECRET=
GOOGLE_MAIL_REFRESH_TOKEN=
GOOGLE_MAIL_FROM=
APP_PUBLIC_URL=http://localhost:5173
SSH_ENABLED=true
SSH_HOST=
SSH_PORT=
SSH_USERNAME=
SSH_PASSWORD=
SSH_REMOTE_DB_HOST=
SSH_REMOTE_DB_PORT=3306
APP_CORS_ALLOWED_ORIGINS=http://localhost:5173
APP_OAUTH2_REDIRECT_URI=http://localhost:5173/oauth2/redirect
SSH_STRICT_HOST_KEY_CHECKING=no
```

운영환경은 Fly secrets로 넣는다.

```bash
fly secrets set DB_PASSWORD=...
fly secrets set JWT_SECRET=...
fly secrets set GOOGLE_CLIENT_ID=...
fly secrets set GOOGLE_CLIENT_SECRET=...
fly secrets set APP_CORS_ALLOWED_ORIGINS=https://procmanager.fly.dev
```

운영 profile은 Dockerfile에서 `--spring.profiles.active=prod`로 실행된다. 운영 DB는 `application-prod.properties` 기준 TiDB Serverless 직접 연결이며 SSH 터널을 쓰지 않는다.

## 4. 현재 Git 상태 주의

이 문서를 만들 때 확인된 작업트리 상태:

- `HEAD`와 `origin/master`는 둘 다 `2c7e7ee`다.
- `CLAUDE.md`, `TODO.md`, `img.png` 삭제는 `2c7e7ee` 커밋에 포함되어 있다.
- `frontend/src/components/TaskManager.jsx`의 메모리 그래프 Y축 라벨 통일도 `2c7e7ee` 커밋에 포함되어 있다.
- 현재 새로 추가한 인수인계 문서 `PROJECT_HANDOFF.md`만 아직 미커밋 상태다.

다른 PC에서 이 문서까지 받으려면 `PROJECT_HANDOFF.md`를 커밋/푸시해야 한다.

상태 확인:

```bash
git status --short --branch
git diff --stat
git diff --cached --stat
```

## 5. 작업 규칙

루트 `AGENTS.md` 기준 규칙:

- 사용자의 의도를 먼저 파악하고 불명확하면 작업 전에 확인한다.
- 파일/코드 추가, 수정, 삭제 전에는 어느 부분을 어떻게 바꿀지 설명하고 확인받는다.
- 관련 없는 코드는 건드리지 않는다.
- 코드 수정 시 해당 기능이 무엇을 하는지 주석을 단다.
- 작업 후 개선할 점, 하지 못한 점, 잘한 점을 피드백한다.
- 가능한 범위에서 디버깅/검증한다.
- 개발환경과 배포환경을 모두 고려한다.
- 커밋 전에는 관련 빌드/린트/컴파일 검증을 수행한다.
- 커밋, 푸쉬, 빌드, 배포는 사용자의 요청 또는 확인이 있을 때 진행한다.
- 배포 전후 현재 커밋/브랜치/변경 파일/서비스 상태/로그를 확인한다.

## 6. 주요 명령어

프론트 검증:

```bash
cd frontend
npm run lint
npm run build
```

백엔드 검증:

```bash
cd backend
./gradlew build
```

전체 배포 이미지 빌드 흐름:

```bash
docker build -t processmanager .
```

Fly 배포:

```bash
fly deploy
fly status
fly logs
```

Git 커밋/푸시:

```bash
git status --short --branch
git diff --check
git add -A
git commit -m "..."
git push origin master
```

## 7. 개발/운영 차이

개발환경:

- 프론트 Vite 서버: `localhost:5173`
- 백엔드 Spring Boot: `localhost:8080`
- Vite proxy:
  - `/api` -> `http://localhost:8080`
  - `/ws` -> `http://localhost:8080`
- DB는 SSH 터널을 통해 로컬 `13306`으로 붙는 구성이 기본이다.
- SSH 터널 실패 시 백엔드 ApplicationContext가 뜨지 않고 Vite proxy가 `ECONNREFUSED`를 낸다.

운영환경:

- Fly.io에서 Spring Boot가 프론트 정적 파일까지 같이 서빙한다.
- Dockerfile은 프론트 빌드 결과를 `backend/src/main/resources/static/`으로 복사한 뒤 JAR를 만든다.
- 운영 DB는 TiDB Serverless 직접 연결이다.
- 운영 OAuth redirect URI는 `https://procmanager.fly.dev/login/oauth2/code/google`로 고정되어 있다.

## 8. 에이전트 저장소

에이전트 소스는 이 저장소 안에 없다. 별도 저장소다.

- 저장소: `https://github.com/duwon1/processManager-agent.git`
- 백엔드 정적 설치 스크립트: `backend/src/main/resources/static/agent/install.sh`
- 에이전트는 GitHub에 푸시된 코드를 기준으로 업데이트를 받는다.

설치 스크립트 핵심:

- 기본 설치 경로: `/opt/processManager-agent`
- systemd 서비스명: `processmanager-agent`
- `--instance`를 주면 개발/운영을 한 PC에 동시에 설치할 수 있다.
  - 예: `/opt/processManager-agent-dev`
  - 예: `processmanager-agent-dev`
- API 포트는 `8888-8999` 중 실제 bind 가능한 포트를 자동 선택한다.
- 재설치 시 기존 `AGENT_ID`는 보존하고 설치 파일은 덮어쓴다.
- `.env` 권한은 `chmod 600`으로 제한한다.

설치 예시:

```bash
curl -sSL https://procmanager.fly.dev/agent/install.sh | sudo bash -s -- \
  --server https://procmanager.fly.dev \
  --token 등록용토큰 \
  --instance prod
```

개발 서버용 예시:

```bash
curl -sSL http://localhost:8080/agent/install.sh | sudo bash -s -- \
  --server http://localhost:8080 \
  --token 등록용토큰 \
  --instance dev
```

## 9. 에이전트 인증 설계

현재 방향:

- 사용자 계정 토큰은 신규 등록용이다.
- 등록 후에는 서버가 노드별 `agent_secret`을 발급한다.
- 에이전트는 `AGENT_SECRET`을 `.env`에 저장하고 이후 재접속에는 이 값을 쓴다.
- 토큰을 재발급해도 기존 노드는 초기화되면 안 된다.
- 이전 등록 토큰으로 신규 등록은 막아야 한다.
- 노드별 secret 해시를 DB에 저장한다.

리스크:

- 등록용 토큰이 유출되면 새 노드 등록에 악용될 수 있다.
- 그래서 토큰은 등록에만 쓰고, 기존 노드 생명주기는 `agent_secret`으로 분리한다.
- 향후 노드별 secret 폐기/회전 기능이 필요하다.

중요 보안 메모:

- 과거 대화 중 GitHub 토큰 문자열이 노출된 적이 있다.
- 다른 문서나 커밋에 토큰 원문을 절대 남기지 않는다.
- 노출된 토큰은 GitHub에서 폐기하고 새로 발급하는 것이 안전하다.

## 10. 노드 삭제 설계

권장/현재 방향:

- 삭제 버튼을 누르면 DB에서 바로 물리 삭제하지 않고 삭제 대기 상태로 전환한다.
- 온라인 에이전트는 uninstall 명령을 받으면 ACK를 보낸다.
- 서버는 ACK를 받은 뒤 최종 삭제한다.
- ACK가 오지 않는 구버전/오프라인 에이전트는 유예 후 정리하거나 실패 상태를 표시한다.
- 프론트에는 삭제 대기/삭제 실패/최종 삭제 상태가 명확히 보여야 한다.

이유:

- 에이전트 PC에 파일과 systemd 서비스가 남아 있으면 재설치가 업데이트처럼 동작할 수 있다.
- DB만 먼저 지우면 서버 UI에서는 사라져도 실제 PC에는 에이전트가 남는다.
- 반대로 ACK 없이 무한 대기하면 운영 UI에서 삭제가 끝나지 않는다.

남은 확인:

- 운영 환경에서 삭제 대기, ACK, 최종 삭제 흐름 재검증
- 오프라인 노드 삭제 정책 확정
- 삭제 실패 사유를 UI에 노출

## 11. OS별 에이전트 구조 결정

목표는 Linux, Windows, macOS 모두 지원하는 에이전트다.

결정한 방향:

- 전송/인증/WebSocket/STOMP/명령 라우팅은 공통 코드로 둔다.
- OS별 데이터 수집만 분리한다.
- 서버가 데이터를 하나하나 요구하는 방식보다 에이전트가 가진 스냅샷을 주기적으로 보내는 방식이 적합하다.
- OS별로 없는 값은 보내지 않거나 `null`로 보낸다.
- 프론트는 받은 데이터만 표시하고, 없는 값은 숨긴다.

권장 폴더 구조:

```text
processManager-agent/
  agent/
    core/
      config.py
      stomp_client.py
      registry.py
      commands.py
      update.py
    collectors/
      base.py
      linux/
        system.py
        cpu.py
        memory.py
        disk.py
        network.py
        process.py
        service.py
        terminal.py
      windows/
        system.py
        cpu.py
        memory.py
        disk.py
        network.py
        process.py
        service.py
        terminal.py
      macos/
        system.py
        cpu.py
        memory.py
        disk.py
        network.py
        process.py
        service.py
        terminal.py
    format/
      schema.py
      units.py
    main.py
```

중요 원칙:

- 에이전트는 가능하면 원시값을 보낸다.
  - 예: bytes, bytesPerSecond, percent, epoch seconds
- 단위 변환과 한글 라벨은 프론트에서 처리한다.
- 에이전트가 한글로 번역해서 보내면 OS별/언어별 확장이 어려워진다.
- 서버는 OS별 특수 필드를 엄격한 고정 DTO로 강제하지 않는 편이 좋다.
- OS별 특수 정보는 `sections` 또는 key-value 형태로 받아 프론트에서 라벨 매핑한다.

## 12. 시스템 정보/단위 처리 결정

현재 방향:

- Linux 에이전트에서 단위 변환을 많이 하지 않는다.
- 서버/프론트가 해석 가능한 raw key를 유지한다.
- 프론트에서 `formatByUnit` 계열 함수로 동적 단위 변환한다.
- 표시 라벨은 프론트 `ITEM_LABELS`에서 한글로 관리한다.

예시:

```json
{
  "memory": {
    "totalBytes": 17179869184,
    "usedBytes": 8589934592,
    "availableBytes": 8589934592,
    "usagePercent": 50.0
  }
}
```

표시:

- `totalBytes` -> `전체`
- `usedBytes` -> `사용 중`
- `availableBytes` -> `사용 가능`
- `usagePercent` -> `사용률`

## 13. 작업관리자 UI 현재 방향

파일: `frontend/src/components/TaskManager.jsx`

최근 주요 변경:

- Windows 작업관리자 스타일에 가깝게 리소스 목록과 그래프 영역을 재구성했다.
- 상세 탭을 없애고 필요한 정보를 한 화면에 표시한다.
- CPU/메모리/디스크/네트워크/GPU별 중복 정보는 필터링한다.
- OS별 특수 정보는 `SystemSections`에서 보조 정보로 표시한다.
- 그래프는 기본 폭이 컨테이너의 75%에서 시작한다.
- 그래프 크기 조절:
  - 오른쪽 핸들: 가로 조절
  - 하단 핸들: 세로 조절
  - 우하단 핸들: 대각 조절
- 모바일에서 그래프 제목/값 겹침을 줄이도록 상단 오버레이를 숨겼다.
- 네트워크 Y축은 `B/s`, `KB/s`, `MB/s`로 동적 표시한다.
- 디스크는 fallback `usagePercent`를 우선 사용한다.
- 메모리 Y축 라벨은 `'% 사용률'`로 통일해야 한다.
- 긴 CPU/GPU/디스크 모델명은 그래프 상단에서 말줄임 없이 줄바꿈되도록 수정했다.

주의:

- 화면 비율/반응형이 민감하므로 `TaskManager.jsx` 수정 후 반드시 `npm run lint`, `npm run build`를 실행한다.
- 모바일에서 텍스트 겹침, Y축 잘림, 그래프 높이 깨짐을 직접 확인하는 것이 좋다.

## 14. 파일 관리자/터미널 방향

현재 방향:

- 터미널 왼쪽에 파일/폴더 리스트를 세로로 보여주는 UI를 원한다.
- 파일인지 폴더인지 구분 가능한 아이콘 또는 표시가 필요하다.
- 에이전트가 `file-list` 명령을 받아 디렉토리 목록을 보내는 흐름이 설치 스크립트 런타임 패치에 포함되어 있다.

앞으로 필요:

- 파일 읽기/쓰기/삭제/이름변경
- 업로드/다운로드
- 권한 변경
- OS별 경로 차이 처리
- 삭제/수정은 사용자 확인을 거치는 UI

## 15. 시계열 DB 검토

InfluxDB 같은 시계열 DB는 장기 메트릭 저장에는 좋지만 운영 복잡도가 늘어난다.

현재 요구가 완전 무료 우선이라면:

- 처음에는 기존 DB에 최근 데이터/요약 데이터만 저장하거나 메모리 캐시로 시작한다.
- Fly/TiDB 조합에서 추가 DB를 늘리면 관리 포인트가 커진다.
- 장기 보관, 다운샘플링, 알림 룰이 필요해지는 시점에 InfluxDB 또는 Prometheus 계열을 검토한다.

무료 배포 관점:

- InfluxDB를 직접 띄우려면 별도 VM/볼륨/백업이 필요하다.
- 완전 무료만 고집하면 운영 안정성이 떨어질 수 있다.
- 당장은 DB 추가보다 현재 모니터링 스냅샷 구조를 안정화하는 것이 우선이다.

## 16. 알려진 오류와 원인

Vite proxy `ECONNREFUSED`:

- 백엔드가 실행 중이 아니거나 Spring Boot 시작 실패
- SSH 터널 접속 실패
- 백엔드 포트가 8080이 아닌 곳에서 실행 중

Spring `sshTunnelConfig` 시작 실패:

- `SSH_HOST`, `SSH_PORT` 접속 timeout
- 서버 방화벽/포트포워딩 문제
- 개발 DB SSH 터널 설정 문제
- 운영에서는 SSH 터널을 쓰지 않도록 profile 확인 필요

로그인 후 다시 로그인창으로 이동:

- `/api/auth/refresh`가 401
- refresh cookie 없음, 만료, SameSite/Secure/domain 문제
- 백엔드가 죽어 있으면 proxy 오류로 인증 상태 복구 실패

React SVG 경고:

- `xmlns:xlink`는 React JSX에서 `xmlnsXlink`로 써야 한다.

노드가 갑자기 여러 개 생김:

- 더미 데이터, 개발/운영 에이전트 중복 등록, 토큰 재등록, AGENT_ID 보존 실패 가능성
- 노드명/agentId/instance/serviceName 기준을 확인해야 한다.

## 17. 배포 전 체크리스트

```bash
git status --short --branch
git diff --check
cd frontend && npm run lint && npm run build
cd ../backend && ./gradlew build
```

배포:

```bash
cd ..
fly deploy
fly status
fly logs
```

배포 후 확인:

- `https://procmanager.fly.dev` 접속
- Google 로그인
- `/api/auth/refresh` 정상
- 노드 목록 로딩
- WebSocket 연결
- 에이전트 업데이트 알림 상태
- 터미널 접속
- 파일 목록 요청
- 작업관리자 그래프/메트릭 표시

## 18. 남은 TODO

우선순위 높음:

- 운영 에이전트 재설치 후 `agent_secret` 발급/저장 확인
- 기존 설치 에이전트가 새 secret 구조로 정상 전환되는지 검증
- 운영 환경 노드 삭제 대기/ACK/최종 삭제 흐름 재검증
- 삭제 실패 사유를 프론트에 상태로 표시
- 에이전트 GitHub 저장소에 설치 스크립트 런타임 패치 내용을 정식 반영
- 개발/운영 에이전트 한 PC 동시 설치 시 포트/서비스/노드명 충돌 재검증
- Windows/macOS 에이전트 collector 설계 및 구현

중기:

- 파일 관리자 기능 확장
- 로그 뷰어
- Docker 컨테이너 관리
- 전체 노드 대시보드
- 알림 시스템
- 감사 로그
- 팀/권한 관리

기술 부채:

- `ApiController` 도메인별 분리
- `DashBoard.jsx` WebSocket 로직 커스텀 훅 분리
- `ProcessTable.jsx` 서브 컴포넌트 분리
- 에이전트 명령 브로드캐스트 구조를 노드별 타겟 채널로 개선
- 운영/개발 환경 설정 문서 정리

## 19. 다른 PC에서 이어받을 때 첫 질문

새 PC에서 작업을 시작하면 먼저 아래를 확인한다.

```bash
git pull origin master
git status --short --branch
cd frontend && npm ci && npm run lint && npm run build
cd ../backend && ./gradlew build
```

그 다음 확인할 것:

- `.env`가 있는가
- Fly secrets가 설정되어 있는가
- Google OAuth redirect URI가 현재 도메인과 맞는가
- 운영/개발 중 어느 환경을 대상으로 작업하는가
- 에이전트 저장소 변경도 필요한 작업인가
- 커밋/푸시/배포까지 사용자가 요청했는가
