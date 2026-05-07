# Process Manager

원격 서버를 웹 브라우저에서 실시간 모니터링하고 관리하는 풀스택 애플리케이션입니다.
에이전트를 설치한 서버는 IP/포트포워딩 없이도 접속할 수 있습니다.

## 주요 기능

- **실시간 모니터링** - CPU, GPU, 메모리, 디스크, 네트워크 사용률을 차트로 표시
- **프로세스 관리** - 원격 서버의 프로세스 목록 조회 및 종료(kill)
- **웹 터미널** - xterm.js + PTY 기반 브라우저 터미널 (SSH 없이 원격 쉘 접속)
- **Google OAuth2 로그인** - 구글 계정 기반 인증
- **다중 노드 관리** - 여러 서버를 하나의 대시보드에서 관리
- **자동 재연결** - 에이전트/브라우저 연결이 끊겨도 자동 복구

## 기술 스택

| 구분 | 기술 |
|------|------|
| Backend | Java 21, Spring Boot 4.0.3, MyBatis, MySQL |
| Frontend | React 19, Vite 8, Bootstrap 5 (Vapor 테마) |
| 실시간 통신 | WebSocket, STOMP, SockJS |
| 터미널 | xterm.js, PTY (에이전트) |
| 인증 | JWT + Refresh Token (HttpOnly Cookie), Google OAuth2 |
| Agent | Python, FastAPI, psutil |

## 아키텍처

```
브라우저 (React + xterm.js)
    ↕ STOMP WebSocket
백엔드 (Spring Boot)
    ↕ STOMP WebSocket
에이전트 (Python, 원격 서버)
    ↕ PTY / psutil
리눅스 서버
```

에이전트가 백엔드에 아웃바운드 연결하므로, 원격 서버에 포트포워딩이나 공인 IP가 필요 없습니다.

## 실행 방법

### 1. 백엔드

```bash
cd backend

# .env 파일 생성 (필수 환경변수)
cat > .env << EOF
DB_USERNAME=your_db_user
DB_PASSWORD=your_db_password
JWT_SECRET=your_jwt_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_MAIL_CLIENT_ID=your_gmail_api_oauth_client_id
GOOGLE_MAIL_CLIENT_SECRET=your_gmail_api_oauth_client_secret
GOOGLE_MAIL_REFRESH_TOKEN=your_gmail_api_refresh_token
GOOGLE_MAIL_FROM=your_project_gmail@gmail.com
APP_PUBLIC_URL=http://localhost:5173
SSH_HOST=your_ssh_host
SSH_PORT=your_ssh_port
SSH_USERNAME=your_ssh_user
SSH_PASSWORD=your_ssh_password
SSH_REMOTE_DB_HOST=your_db_host
SSH_REMOTE_DB_PORT=3306
APP_CORS_ALLOWED_ORIGINS=http://localhost:5173
SSH_STRICT_HOST_KEY_CHECKING=no
EOF

# 실행
./gradlew bootRun
```

### 2. 프론트엔드

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173 에서 접속
```

## 배포

운영 배포는 GitHub Actions가 Fly.io에 배포합니다. `master` 브랜치에 push하면 `.github/workflows/fly-deploy.yml`이 실행되고, 저장소의 `Dockerfile`로 프론트엔드와 백엔드를 함께 빌드해 Fly.io 앱 `procmanager`에 배포합니다.

처음 한 번만 GitHub 저장소 설정에서 Actions secret을 등록해야 합니다.

```bash
FLY_API_TOKEN=<Fly.io deploy token>
```

Fly.io 런타임 환경변수는 GitHub가 아니라 Fly secrets에 저장합니다.

```bash
fly secrets set DB_PASSWORD=...
fly secrets set JWT_SECRET=...
fly secrets set GOOGLE_CLIENT_ID=...
fly secrets set GOOGLE_CLIENT_SECRET=...
fly secrets set APP_CORS_ALLOWED_ORIGINS=https://procmanager.fly.dev
fly secrets set GOOGLE_MAIL_CLIENT_ID=...
fly secrets set GOOGLE_MAIL_CLIENT_SECRET=...
fly secrets set GOOGLE_MAIL_REFRESH_TOKEN=...
fly secrets set GOOGLE_MAIL_FROM=...
fly secrets set APP_PUBLIC_URL=https://procmanager.fly.dev
```

### 3. 에이전트

에이전트는 별도 저장소에서 관리합니다: [processManager-agent](https://github.com/duwon1/processManager-agent)

## 관련 저장소

- [processManager-agent](https://github.com/duwon1/processManager-agent) - 원격 서버에 설치하는 Python 에이전트
