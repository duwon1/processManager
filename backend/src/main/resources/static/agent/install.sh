#!/bin/bash
# Process Manager Agent 설치 스크립트
# 사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token> [--instance <name>]
set -e

REPO_URL="https://github.com/duwon1/processManager-agent.git"
BASE_INSTALL_DIR="/opt/processManager-agent"
BASE_SERVICE_NAME="processmanager-agent"
BASE_SUDOERS_FILE="/etc/sudoers.d/processmanager"

# ── 인자 파싱 ──────────────────────────────────────────────
SERVER_URL=""
TOKEN=""
INSTANCE=""
AGENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"

while [[ $# -gt 0 ]]; do
    case $1 in
        --server) SERVER_URL="$2"; shift 2 ;;
        --token)  TOKEN="$2";      shift 2 ;;
        --instance) INSTANCE="$2"; shift 2 ;;
        *)        echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
done

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ]; then
    echo "사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token> [--instance <name>]"
    exit 1
fi

# 인스턴스 이름을 지정하면 개발/배포 에이전트를 한 PC에 동시에 설치할 수 있도록 경로와 서비스명을 분리합니다.
if [ -n "$INSTANCE" ]; then
    if ! [[ "$INSTANCE" =~ ^[a-zA-Z0-9_-]+$ ]]; then
        echo "--instance 값은 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다."
        exit 1
    fi
    INSTALL_DIR="${BASE_INSTALL_DIR}-${INSTANCE}"
    SERVICE_NAME="${BASE_SERVICE_NAME}-${INSTANCE}"
    SUDOERS_FILE="${BASE_SUDOERS_FILE}-${INSTANCE}"
else
    INSTALL_DIR="$BASE_INSTALL_DIR"
    SERVICE_NAME="$BASE_SERVICE_NAME"
    SUDOERS_FILE="$BASE_SUDOERS_FILE"
fi

# ws URL 변환 (http → ws, https → wss)
WS_URL=$(echo "$SERVER_URL" | sed 's|^http://|ws://|; s|^https://|wss://|')

# ── 에이전트 런타임 패치 ───────────────────────────────────
# GitHub 에이전트 저장소 인증이 불안정할 때도 설치 스크립트만으로 ACK/인스턴스 서비스명 지원을 적용합니다.
patch_agent_runtime_files() {
    python3 - "$INSTALL_DIR" <<'PY'
from pathlib import Path
import sys

base = Path(sys.argv[1])

def line_start(text, index):
    return text.rfind("\n", 0, index) + 1

def write(path, text):
    path.write_text(text.replace("\r\n", "\n").replace("\r", "\n"), encoding="utf-8")

config_path = base / "config.py"
config = config_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
if "    instance: str" not in config:
    lines = []
    inserted = False
    for line in config.split("\n"):
        lines.append(line)
        if not inserted and line.strip().startswith("agent_id: str"):
            lines.append("    instance: str   # install instance name such as dev/prod")
            lines.append("    service_name: str  # systemd service name controlled during update/uninstall")
            inserted = True
    config = "\n".join(lines)
if 'service_name   = os.getenv("SERVICE_NAME"' not in config:
    config = config.replace(
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n',
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n'
        '    instance       = os.getenv("INSTANCE", "default").strip()\n'
        '    service_name   = os.getenv("SERVICE_NAME", "processmanager-agent").strip()\n',
    )
if "        service_name=service_name," not in config:
    config = config.replace(
        "        agent_id=agent_id,\n",
        "        agent_id=agent_id,\n"
        "        instance=instance,\n"
        "        service_name=service_name,\n",
    )
write(config_path, config)

main_path = base / "main.py"
main = main_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
main = main.replace(
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id)",
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name)",
)
main = main.replace(
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name, settings.service_name)",
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name)",
)
write(main_path, main)

agent_path = base / "agent.py"
agent = agent_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
if "import shlex" not in agent:
    agent = agent.replace("import json\n", "import json\nimport shlex\n")
agent = agent.replace(
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "") -> None:',
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "", service_name: str = "processmanager-agent") -> None:',
)

update_index = agent.find('if cmd_type == "update":')
uninstall_index = agent.find('if cmd_type == "uninstall":')
terminal_index = agent.find('if cmd_type.startswith("terminal-")')
if min(update_index, uninstall_index, terminal_index) >= 0:
    update_start = line_start(agent, update_index)
    uninstall_start = line_start(agent, uninstall_index)
    update_block = '''                        if cmd_type == "update":
                            if payload.get("nodeName") == hostname:
                                print("[agent] update command received; starting self-update")
                                import subprocess, os
                                agent_dir = os.path.dirname(os.path.abspath(__file__))
                                # Use the instance-specific systemd service so dev/prod agents do not overwrite each other.
                                safe_service_name = shlex.quote(service_name)
                                cmds = ' && '.join([
                                    f'git -C {agent_dir} pull origin master',
                                    f'{agent_dir}/.venv/bin/pip install -r {agent_dir}/requirements.txt -q',
                                    f'sudo systemctl restart {safe_service_name} 2>/dev/null || true',
                                ])
                                subprocess.Popen(['bash', '-c', f'sleep 1 && {cmds}'])
                                raise SystemExit(0)
                            continue

                        # Uninstall command handling
'''
    agent = agent[:update_start] + update_block + agent[uninstall_start:]
    uninstall_index = agent.find('if cmd_type == "uninstall":')
    terminal_index = agent.find('if cmd_type.startswith("terminal-")')
    uninstall_start = line_start(agent, uninstall_index)
    terminal_start = line_start(agent, terminal_index)
    uninstall_block = '''                        if cmd_type == "uninstall":
                            if payload.get("nodeName") == hostname:
                                print("[agent] uninstall command received; sending ack")
                                # Send ACK first so the server can remove the node from the UI only after the agent receives the command.
                                await websocket.send(stomp_frame(
                                    "SEND",
                                    {"destination": "/app/agent.uninstall-ack", "content-type": "application/json"},
                                    json.dumps({
                                        "nodeName": hostname,
                                        "serviceName": service_name,
                                        "stage": "started",
                                    }),
                                ))
                                print("[agent] uninstall ack sent; starting self-removal")
                                import subprocess, os
                                agent_dir = os.path.dirname(os.path.abspath(__file__))
                                safe_service_name = shlex.quote(service_name)
                                safe_agent_dir = shlex.quote(agent_dir)
                                cmds = ' && '.join([
                                    f'sudo systemctl disable {safe_service_name} 2>/dev/null || true',
                                    f'sudo systemctl stop {safe_service_name} 2>/dev/null || true',
                                    f'sudo rm -f /etc/systemd/system/{safe_service_name}.service 2>/dev/null || true',
                                    'sudo systemctl daemon-reload 2>/dev/null || true',
                                    f'rm -rf {safe_agent_dir}',
                                ])
                                subprocess.Popen(['bash', '-c', f'sleep 2 && {cmds}'])
                                raise SystemExit(0)
                            continue

                        # Terminal command handling
'''
    agent = agent[:uninstall_start] + uninstall_block + agent[terminal_start:]
write(agent_path, agent)
PY
}

# ── 노드 이름 입력 (/dev/tty로 curl|bash 환경에서도 터미널 입력 가능) ──
printf "Enter node name (press Enter to use system hostname): " > /dev/tty
read -r NODE_NAME < /dev/tty
if [ -z "$NODE_NAME" ]; then
    NODE_NAME=$(hostname)
fi
# 인스턴스 설치일 때 기본 hostname에 인스턴스 suffix를 붙여 개발/배포 노드명이 충돌하지 않게 합니다.
if [ -n "$INSTANCE" ] && [ "$NODE_NAME" = "$(hostname)" ]; then
    NODE_NAME="${NODE_NAME}-${INSTANCE}"
fi
echo "Node name: $NODE_NAME" > /dev/tty

# ── 재설치 감지: AGENT_ID만 보존하고 설치본은 덮어씁니다. ──────
EXISTING_AGENT_ID=""
if [ -d "$INSTALL_DIR" ]; then
    echo "Existing installation detected. Reinstalling from scratch..."
    # 같은 물리 노드로 인식할 수 있도록 기존 AGENT_ID만 보존합니다.
    EXISTING_AGENT_ID=$(grep '^AGENT_ID=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || true)
    # 구버전 서비스/파일이 남아 있어도 새 설치와 충돌하지 않도록 먼저 제거합니다.
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    systemctl daemon-reload 2>/dev/null || true
    rm -rf "$INSTALL_DIR"
fi

echo "========================================"
echo " Process Manager Agent 설치 시작"
echo " 서버: $SERVER_URL"
echo " 인스턴스: ${INSTANCE:-default}"
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
git clone -q "$REPO_URL" "$INSTALL_DIR"
patch_agent_runtime_files
chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"

# ── 가상환경 및 의존성 ─────────────────────────────────────
echo "[3/6] Python 가상환경 및 의존성 설치..."
sudo -u "$AGENT_USER" python3 -m venv "$INSTALL_DIR/.venv"
sudo -u "$AGENT_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt" -q

# ── 환경변수 파일 생성 ─────────────────────────────────────
# curl | bash 환경에서 heredoc이 stdin 충돌로 빈 파일을 생성하는 문제를 방지하기 위해 printf 사용
echo "[4/6] 환경변수 설정..."
# 최초 설치 시 고유 AGENT_ID를 만들고, 재설치 시에는 기존 값을 유지합니다.
AGENT_ID="$EXISTING_AGENT_ID"
if [ -z "$AGENT_ID" ]; then
    AGENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "")
fi
# 에이전트가 업데이트/삭제 시 자기 systemd 서비스명을 정확히 제어할 수 있도록 SERVICE_NAME을 저장합니다.
printf 'ACCOUNT_TOKEN=%s\nSPRING_WS_URL=%s/ws-native\nOS_TYPE=Linux\nAGENT_PORT=8888\nLINUX_API_RELOAD=false\nHOSTNAME=%s\nAGENT_ID=%s\nINSTANCE=%s\nSERVICE_NAME=%s\n' \
    "$TOKEN" "$WS_URL" "$NODE_NAME" "$AGENT_ID" "${INSTANCE:-default}" "$SERVICE_NAME" > "$INSTALL_DIR/.env"
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
