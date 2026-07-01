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
| Backend | Java 21, Spring Boot 4.0.6, MyBatis, MySQL |
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

## API 문서

| 문서 | 내용 |
|------|------|
| **Swagger UI** (`/swagger-ui.html`) | REST API의 최신 소스. 코드 어노테이션에서 자동 생성되며 브라우저에서 직접 시험 호출 가능. 운영에서는 기본 비활성(`SPRINGDOC_ENABLED=true`로 활성화) |
| [docs/API.md](docs/API.md) | REST 개요 + **WebSocket/STOMP 명세**(Swagger가 다루지 않는 실시간 채널) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 시스템 구성과 핵심 흐름(로그인·에이전트 등록·삭제) Mermaid 다이어그램 |
| [docs/adr/](docs/adr/README.md) | 아키텍처 결정 기록(왜 이렇게 설계했는가) |

Swagger UI는 로컬 실행 후 <http://localhost:8080/swagger-ui.html> 에서 접속합니다.
우측 상단 **Authorize**에 Access Token(JWT)을 넣으면 보호된 엔드포인트를 시험할 수 있습니다.

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

운영 배포는 Render Web Service를 사용합니다. 저장소 루트의 `render.yaml`과 `Dockerfile`로 프론트엔드와 백엔드를 함께 빌드해 하나의 Docker Web Service로 실행합니다.

로컬/배포 환경 구분과 실제 환경변수 값은 로컬 전용 `.env.environments.md`를 참고하세요. 이 파일은 민감값이 포함되어 있어 Git에 올리지 않습니다.

기본 배포 주소는 다음과 같이 잡습니다. Render가 다른 주소를 발급하면 Render Dashboard의 실제 URL로 교체하세요.

`https://processmanager-web.onrender.com`

### 3. 에이전트

에이전트는 별도 저장소에서 관리합니다: [processManager-agent](https://github.com/duwon1/processManager-agent)
프로필 화면에서 1회용 설치 토큰을 생성한 뒤 표시되는 설치 명령어를 원격 서버에서 실행하면 노드가 자동 등록됩니다.
설치 토큰은 5분 동안 유효하며, 최대 2번까지 남은 시간을 다시 5분으로 갱신할 수 있습니다. 등록에 한 번 사용되면 재사용할 수 없고, 새 토큰을 만들면 기존 미사용 토큰은 폐기됩니다.

## 관련 저장소

- [processManager-agent](https://github.com/duwon1/processManager-agent) - 원격 서버에 설치하는 Python 에이전트
