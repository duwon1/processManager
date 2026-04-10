#!/bin/bash
# Process Manager Agent 설치 스크립트
# 사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token>
set -e

REPO_URL="https://github.com/duwon1/processManager-agent.git"
INSTALL_DIR="/opt/processManager-agent"
SERVICE_NAME="processmanager-agent"
SUDOERS_FILE="/etc/sudoers.d/processmanager"

# ── 인자 파싱 ──────────────────────────────────────────────
SERVER_URL=""
TOKEN=""
AGENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --server) SERVER_URL="$2"; shift 2 ;;
        --token)  TOKEN="$2";      shift 2 ;;
        *)        echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
done

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ]; then
    echo "사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token>"
    exit 1
fi

# ws URL 변환 (http → ws, https → wss)
WS_URL=$(echo "$SERVER_URL" | sed 's|^http://|ws://|; s|^https://|wss://|')

# ── 노드 이름 입력 (/dev/tty로 curl|bash 환경에서도 터미널 입력 가능) ──
printf "Enter node name (press Enter to use system hostname): " > /dev/tty
read -r NODE_NAME < /dev/tty
if [ -z "$NODE_NAME" ]; then
    NODE_NAME=$(hostname)
fi
echo "Node name: $NODE_NAME" > /dev/tty

# ── 재설치 감지: 이미 설치된 경우 .env만 업데이트하고 재시작 ──────
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "Existing installation detected. Updating configuration only..."
    # 기존 AGENT_ID 보존 (없으면 새로 생성)
    EXISTING_AGENT_ID=$(grep '^AGENT_ID=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2)
    if [ -z "$EXISTING_AGENT_ID" ]; then
        EXISTING_AGENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "")
    fi
    printf 'ACCOUNT_TOKEN=%s\nSPRING_WS_URL=%s/ws-native\nOS_TYPE=Linux\nAGENT_PORT=8888\nLINUX_API_RELOAD=false\nHOSTNAME=%s\nAGENT_ID=%s\n' \
        "$TOKEN" "$WS_URL" "$NODE_NAME" "$EXISTING_AGENT_ID" > "$INSTALL_DIR/.env"
    chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/.env"
    systemctl restart "$SERVICE_NAME"
    echo "========================================"
    echo " ✅ Update complete!"
    echo " Status: systemctl status $SERVICE_NAME"
    echo "========================================"
    exit 0
fi

echo "========================================"
echo " Process Manager Agent 설치 시작"
echo " 서버: $SERVER_URL"
echo " 설치 경로: $INSTALL_DIR"
echo " 실행 사용자: $AGENT_USER"
echo "========================================"

# ── 의존성 확인 및 설치 ────────────────────────────────────
echo "[1/6] 의존성 확인..."
if ! command -v python3 &>/dev/null; then
    echo "  Python3 설치 중..."
    apt-get update -qq && apt-get install -y python3 python3-venv git -qq
elif ! command -v git &>/dev/null; then
    apt-get update -qq && apt-get install -y git -qq
fi

# ── 에이전트 코드 설치 ─────────────────────────────────────
echo "[2/6] 에이전트 코드 설치..."
if [ -d "$INSTALL_DIR/.git" ]; then
    git -C "$INSTALL_DIR" pull -q
else
    git clone -q "$REPO_URL" "$INSTALL_DIR"
fi
chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"

# ── 가상환경 및 의존성 ─────────────────────────────────────
echo "[3/6] Python 가상환경 및 의존성 설치..."
sudo -u "$AGENT_USER" python3 -m venv "$INSTALL_DIR/.venv"
sudo -u "$AGENT_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" -q

# ── 환경변수 파일 생성 ─────────────────────────────────────
# curl | bash 환경에서 heredoc이 stdin 충돌로 빈 파일을 생성하는 문제를 방지하기 위해 printf 사용
echo "[4/6] 환경변수 설정..."
# 최초 설치 시 고유 AGENT_ID 생성 (재설치 시에는 위에서 이미 처리됨)
AGENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "")
printf 'ACCOUNT_TOKEN=%s\nSPRING_WS_URL=%s/ws-native\nOS_TYPE=Linux\nAGENT_PORT=8888\nLINUX_API_RELOAD=false\nHOSTNAME=%s\nAGENT_ID=%s\n' \
    "$TOKEN" "$WS_URL" "$NODE_NAME" "$AGENT_ID" > "$INSTALL_DIR/.env"
chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# ── sudoers 설정 (에이전트 전체 권한) ─────────────────────
echo "[5/6] sudo 권한 설정..."
echo "$AGENT_USER ALL=(ALL) NOPASSWD: ALL" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

# ── systemd 서비스 등록 ────────────────────────────────────
echo "[6/6] systemd 서비스 등록..."
printf '[Unit]\nDescription=Process Manager Agent\nAfter=network.target\n\n[Service]\nType=simple\nUser=%s\nWorkingDirectory=%s\nEnvironment=PYTHONUNBUFFERED=1\nExecStart=%s/.venv/bin/python main.py\nRestart=always\nRestartSec=5\nStandardOutput=journal\nStandardError=journal\n\n[Install]\nWantedBy=multi-user.target\n' \
    "$AGENT_USER" "$INSTALL_DIR" "$INSTALL_DIR" > "/etc/systemd/system/${SERVICE_NAME}.service"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" -q
systemctl restart "$SERVICE_NAME"

echo ""
echo "========================================"
echo " ✅ 설치 완료!"
echo " 상태 확인: systemctl status $SERVICE_NAME"
echo " 로그 확인: journalctl -u $SERVICE_NAME -f"
echo "========================================"
