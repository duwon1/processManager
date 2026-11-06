#!/bin/bash
# Process Manager Agent 설치 스크립트
# 사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token> [--instance <name>] [--ref <commit-sha>]
#
# 설치 토큰은 명령행 인자(--token) 대신 아래 방법으로도 넘길 수 있습니다. (ps/셸 history 노출 방지)
#   - 환경변수: sudo --preserve-env=PROCESS_MANAGER_INSTALL_TOKEN bash install.sh --server <url>
#   - 표준입력: sudo bash install.sh --server <url> --token-stdin < token.txt  (스크립트를 파일로 받은 경우)
#   - 터미널 입력: --token 없이 실행하면 /dev/tty에서 화면에 표시하지 않고 입력받습니다.
# 비대화형 설치(/dev/tty 없음)에서는 --node-name 또는 PROCESS_MANAGER_NODE_NAME을 사용하고, 없으면 hostname을 씁니다.
# http:// 서버 주소는 평문 전송이므로 --allow-insecure(또는 PROCESS_MANAGER_ALLOW_INSECURE=1)를 줄 때만 허용합니다. (localhost 제외)
set -e

REPO_URL="https://github.com/duwon1/processManager-agent.git"
REPO_REF="${PROCESS_MANAGER_AGENT_REF:-}"
BASE_INSTALL_DIR="/opt/processManager-agent"
BASE_SERVICE_NAME="processmanager-agent"
BASE_SUDOERS_FILE="/etc/sudoers.d/processmanager"
BASE_AGENT_PORT=8888
MAX_AGENT_PORT=8999

# ── 인자 파싱 ──────────────────────────────────────────────
SERVER_URL=""
TOKEN="${PROCESS_MANAGER_INSTALL_TOKEN:-}"
TOKEN_FROM_STDIN=""
INSTANCE=""
NODE_NAME="${PROCESS_MANAGER_NODE_NAME:-}"
ALLOW_INSECURE="${PROCESS_MANAGER_ALLOW_INSECURE:-}"
AGENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
TERMINAL_USER="${PROCESS_MANAGER_TERMINAL_USER:-processmanager-terminal}"
TERMINAL_SHELL="$(command -v bash || echo /bin/bash)"
PM_USAGE="사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> [--token <token> | --token-stdin] [--instance <name>] [--node-name <name>] [--ref <commit-sha>] [--allow-insecure]"

while [[ $# -gt 0 ]]; do
    case $1 in
        --server) SERVER_URL="$2"; shift 2 ;;
        --token)  TOKEN="$2";      shift 2 ;;
        --token-stdin) TOKEN_FROM_STDIN=1; shift ;;
        --instance) INSTANCE="$2"; shift 2 ;;
        --node-name) NODE_NAME="$2"; shift 2 ;;
        --ref) REPO_REF="$2"; shift 2 ;;
        --allow-insecure) ALLOW_INSECURE=1; shift ;;
        *)        echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
done

# curl | bash 환경이나 CI/자동화처럼 제어 터미널이 없으면 /dev/tty를 열 수 없으므로 미리 확인합니다.
pm_has_tty() {
    ( exec </dev/tty >/dev/tty ) 2>/dev/null
}

if [ -n "$TOKEN_FROM_STDIN" ]; then
    # 표준입력 첫 줄을 토큰으로 사용합니다. curl | bash 실행에서는 stdin이 스크립트 본문이므로 파일로 받은 뒤 사용하세요.
    IFS= read -r TOKEN || true
fi
if [ -z "$TOKEN" ] && pm_has_tty; then
    printf "Enter install token: " > /dev/tty
    IFS= read -rs TOKEN < /dev/tty || true
    printf "\n" > /dev/tty
fi
TOKEN="${TOKEN//[[:space:]]/}"

if [ -z "$SERVER_URL" ] || [ -z "$TOKEN" ]; then
    echo "$PM_USAGE"
    exit 1
fi
if [ -n "$REPO_REF" ] && ! [[ "$REPO_REF" =~ ^[0-9a-fA-F]{7,64}$ ]]; then
    echo "--ref 값은 Git commit SHA여야 합니다."
    exit 1
fi
# 설치 토큰과 이후 WebSocket(ws://) 통신이 평문으로 오가지 않도록 http://는 명시적으로 허용한 경우에만 사용합니다.
case "$SERVER_URL" in
    https://*) ;;
    http://localhost|http://localhost[:/]*|http://127.0.0.1|http://127.0.0.1[:/]*|http://\[::1\]|http://\[::1\][:/]*) ;;
    http://*)
        if [ -z "$ALLOW_INSECURE" ]; then
            echo "http:// 서버 주소는 설치 토큰과 에이전트 통신(ws://)이 암호화되지 않습니다. https://를 사용하거나 --allow-insecure를 지정하세요."
            exit 1
        fi
        echo "[process-manager] 경고: --allow-insecure로 암호화되지 않은 http:// 서버에 설치합니다."
        ;;
    *)
        echo "--server 값은 https:// 또는 http://로 시작해야 합니다."
        exit 1
        ;;
esac
if ! [[ "$TERMINAL_USER" =~ ^[a-zA-Z0-9_.@-]+$ ]]; then
    echo "터미널 사용자 이름은 영문, 숫자, 점(.), 언더스코어(_), @, 하이픈(-)만 사용할 수 있습니다."
    exit 1
fi

pm_log() {
    echo "[process-manager] $1"
}

pm_fail() {
    echo "[process-manager] 설치 실패: $1" >&2
    exit 1
}

if [ "$(id -u)" -ne 0 ]; then
    pm_fail "root 권한이 필요합니다. 설치 명령어를 sudo로 실행하세요."
fi

json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

detect_package_manager() {
    if command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    elif command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v yum >/dev/null 2>&1; then
        echo "yum"
    elif command -v zypper >/dev/null 2>&1; then
        echo "zypper"
    else
        echo ""
    fi
}

# apt-get update는 첫 패키지 설치 직전에 한 번만 실행해 중복 인덱스 갱신을 피합니다.
PM_APT_UPDATED=""
apt_ensure_updated() {
    if [ -z "$PM_APT_UPDATED" ]; then
        apt-get update -qq
        PM_APT_UPDATED=1
    fi
}

install_linux_packages() {
    if [ "$#" -eq 0 ]; then
        return
    fi

    local manager
    manager=$(detect_package_manager)
    if [ -z "$manager" ]; then
        pm_fail "지원하는 패키지 관리자를 찾지 못했습니다. python3, python3-venv, git, curl, sudo를 설치한 뒤 다시 실행하세요."
    fi

    pm_log "필요한 패키지 설치 중: $*"
    case "$manager" in
        apt)
            export DEBIAN_FRONTEND=noninteractive
            apt_ensure_updated
            apt-get install -y --no-install-recommends "$@" -qq
            ;;
        dnf)
            dnf install -y "$@"
            ;;
        yum)
            yum install -y "$@"
            ;;
        zypper)
            zypper --non-interactive install "$@"
            ;;
    esac
}

ensure_linux_dependencies() {
    # 같은 실행에서 두 번(토큰 검증 전 / [1/6] 단계) 호출돼도 패키지 점검을 한 번만 수행합니다.
    if [ -n "$PM_DEPS_DONE" ]; then
        return
    fi
    PM_DEPS_DONE=1

    local manager packages=()
    manager=$(detect_package_manager)

    if ! command -v curl >/dev/null 2>&1; then
        packages+=("curl")
    fi
    if ! command -v git >/dev/null 2>&1; then
        packages+=("git")
    fi
    if ! command -v sudo >/dev/null 2>&1; then
        packages+=("sudo")
    fi
    if ! command -v python3 >/dev/null 2>&1; then
        packages+=("python3")
    fi

    if [ "${#packages[@]}" -gt 0 ]; then
        install_linux_packages "${packages[@]}"
    fi

    if ! python3 -m venv --help >/dev/null 2>&1; then
        case "$manager" in
            apt) install_linux_packages python3-venv ;;
            dnf|yum|zypper) install_linux_packages python3-pip ;;
            *) pm_fail "python3 venv 모듈을 사용할 수 없습니다. python3-venv 또는 python3-pip를 설치한 뒤 다시 실행하세요." ;;
        esac
    fi
    if ! python3 -m venv --help >/dev/null 2>&1; then
        pm_fail "python3 venv 모듈을 사용할 수 없습니다. python3-venv 설치를 확인하세요."
    fi

    if ! command -v dmidecode >/dev/null 2>&1; then
        if [ -n "$manager" ]; then
            install_linux_packages dmidecode || pm_log "dmidecode 설치를 건너뜁니다. 하드웨어 메모리 상세 정보만 제한될 수 있습니다."
        else
            pm_log "dmidecode가 없어 하드웨어 메모리 상세 정보만 제한될 수 있습니다."
        fi
    fi

    local inventory_packages=()
    if ! command -v lspci >/dev/null 2>&1; then
        inventory_packages+=("pciutils")
    fi
    if ! command -v lsusb >/dev/null 2>&1; then
        inventory_packages+=("usbutils")
    fi
    if [ "${#inventory_packages[@]}" -gt 0 ]; then
        if [ -n "$manager" ]; then
            install_linux_packages "${inventory_packages[@]}" || pm_log "장치 인벤토리 보조 도구 설치를 건너뜁니다. 일부 PCI/USB 장치 정보가 N/A로 표시될 수 있습니다."
        else
            pm_log "lspci/lsusb가 없어 일부 PCI/USB 장치 정보가 N/A로 표시될 수 있습니다."
        fi
    fi
}

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
SYSTEMCTL_PATH="$(command -v systemctl || echo /bin/systemctl)"
RM_PATH="$(command -v rm || echo /bin/rm)"

validate_install_token() {
    local validate_url="${SERVER_URL%/}/api/agent/install-token/claim"
    local payload response message
    local curl_headers=()

    case "$SERVER_URL" in
        *ngrok-free.dev*|*ngrok-free.app*|*ngrok.io*)
            curl_headers=(-H "ngrok-skip-browser-warning: true")
            ;;
    esac

    pm_log "설치 명령어 확인 중..."
    payload=$(printf '{"installToken":"%s","agentId":"%s"}' "$(json_escape "$TOKEN")" "$(json_escape "$AGENT_ID")")
    if ! response=$(curl -sS -m 15 "${curl_headers[@]}" -H "Content-Type: application/json" -X POST --data "$payload" "$validate_url" 2>/dev/null); then
        pm_fail "서버에 연결할 수 없습니다. 서버 주소와 네트워크를 확인하세요."
    fi

    if printf '%s' "$response" | grep -q '"valid"[[:space:]]*:[[:space:]]*true'; then
        pm_log "설치 명령어 확인 완료"
        # 서버가 검증된 에이전트 커밋(agentRef)을 내려주면 --ref가 없을 때 그 커밋으로 고정 설치합니다.
        if [ -z "$REPO_REF" ]; then
            local server_ref
            server_ref=$(printf '%s' "$response" | sed -n 's/.*"agentRef"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]\{7,64\}\)".*/\1/p' | head -n 1)
            if [ -n "$server_ref" ]; then
                REPO_REF="$server_ref"
                pm_log "서버가 지정한 에이전트 버전으로 설치합니다: $REPO_REF"
            fi
        fi
        return
    fi

    code=$(printf '%s' "$response" | sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
    case "$code" in
        TOKEN_REQUIRED|TOKEN_INVALID_FORMAT)
            message="설치 명령어가 올바르지 않습니다."
            ;;
        TOKEN_UNAVAILABLE)
            message="설치 명령어가 만료되었거나 이미 사용되었습니다."
            ;;
        *)
            message=""
            ;;
    esac
    if [ -z "$message" ]; then
        message=$(printf '%s' "$response" | sed -n 's/.*"message"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
    fi
    if [ -z "$message" ]; then
        message=$(printf '%s' "$response" | sed -n 's/.*"detail"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
    fi
    if [ -z "$message" ]; then
        message="서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도하세요."
    fi
    pm_fail "$message"
}

# 재설치 시 같은 물리 노드로 인식하도록 기존 AGENT_ID와 가능한 기존 API 포트를 보존합니다.
EXISTING_AGENT_ID=""
EXISTING_AGENT_PORT=""
if [ -d "$INSTALL_DIR" ]; then
    EXISTING_AGENT_ID=$(grep '^AGENT_ID=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || true)
    EXISTING_AGENT_PORT=$(grep '^AGENT_PORT=' "$INSTALL_DIR/.env" 2>/dev/null | cut -d= -f2 || true)
fi

AGENT_ID="$EXISTING_AGENT_ID"
if [ -z "$AGENT_ID" ]; then
    AGENT_ID=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "")
fi
if [ -z "$AGENT_ID" ]; then
    pm_fail "에이전트 ID를 생성할 수 없습니다. uuidgen 설치 또는 /proc 접근 권한을 확인하세요."
fi

ensure_linux_dependencies
validate_install_token

# ws URL 변환 (http → ws, https → wss)
WS_URL=$(echo "$SERVER_URL" | sed 's|^http://|ws://|; s|^https://|wss://|')

# ── 에이전트 API 포트 선택 ─────────────────────────────────
# dev/prod 에이전트가 한 PC에 동시에 설치될 수 있으므로 실제 bind 가능한 포트를 자동 선택합니다.
is_port_available() {
    local port="$1"
    python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
    try:
        sock.bind(("0.0.0.0", port))
    except OSError:
        sys.exit(1)
sys.exit(0)
PY
}

choose_agent_port() {
    local preferred_port="$1"
    local port

    # 재설치 시에는 기존 포트가 비어 있으면 같은 포트를 유지해 외부 연동 영향을 줄입니다.
    if [[ "$preferred_port" =~ ^[0-9]+$ ]] && is_port_available "$preferred_port"; then
        echo "$preferred_port"
        return
    fi

    for port in $(seq "$BASE_AGENT_PORT" "$MAX_AGENT_PORT"); do
        if is_port_available "$port"; then
            echo "$port"
            return
        fi
    done

    echo "사용 가능한 에이전트 포트를 찾지 못했습니다. (${BASE_AGENT_PORT}-${MAX_AGENT_PORT})" >&2
    exit 1
}

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
if "    agent_secret: str" not in config:
    config = config.replace(
        "    agent_id: str  # 에이전트 고유 UUID (재설치 시 동일 노드 식별)\n",
        "    agent_id: str  # 에이전트 고유 UUID (재설치 시 동일 노드 식별)\n"
        "    agent_secret: str  # 등록 후 재접속에 사용하는 노드 전용 secret\n",
    )
if 'service_name   = os.getenv("SERVICE_NAME"' not in config:
    config = config.replace(
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n',
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n'
        '    agent_secret   = os.getenv("AGENT_SECRET", "").strip()\n'
        '    instance       = os.getenv("INSTANCE", "default").strip()\n'
        '    service_name   = os.getenv("SERVICE_NAME", "processmanager-agent").strip()\n',
    )
elif 'agent_secret   = os.getenv("AGENT_SECRET"' not in config:
    config = config.replace(
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n',
        '    agent_id       = os.getenv("AGENT_ID", "").strip()\n'
        '    agent_secret   = os.getenv("AGENT_SECRET", "").strip()\n',
    )
config = config.replace(
    '    # ACCOUNT_TOKEN은 설치 시 반드시 주입해야 합니다.\n'
    '    account_token = os.getenv("ACCOUNT_TOKEN", "").strip()\n'
    '    if not account_token:\n'
    '        raise RuntimeError("ACCOUNT_TOKEN이 없습니다. 설치 시 토큰을 주입해주세요.")\n',
    '    account_token = os.getenv("ACCOUNT_TOKEN", "").strip()\n'
    '    agent_secret   = os.getenv("AGENT_SECRET", "").strip()\n'
    '    if not account_token and not agent_secret:\n'
    '        raise RuntimeError("ACCOUNT_TOKEN 또는 AGENT_SECRET이 필요합니다.")\n',
)
config = config.replace(
    '    # ACCOUNT_TOKEN은 설치 시 반드시 주입해야 합니다.\n'
    '    account_token = os.getenv("ACCOUNT_TOKEN", "").strip()\n'
    '    if not account_token:\n'
    '        raise RuntimeError("ACCOUNT_TOKEN이 없습니다. 설치 시 토큰을 주입해주세요.")\n\n',
    '    account_token = os.getenv("ACCOUNT_TOKEN", "").strip()\n'
    '    agent_secret   = os.getenv("AGENT_SECRET", "").strip()\n'
    '    if not account_token and not agent_secret:\n'
    '        raise RuntimeError("ACCOUNT_TOKEN 또는 AGENT_SECRET이 필요합니다.")\n\n',
)
config = config.replace(
    '    agent_secret   = os.getenv("AGENT_SECRET", "").strip()\n'
    '    hostname       = os.getenv("HOSTNAME", socket.gethostname() or "Linux-Server")\n',
    '    hostname       = os.getenv("HOSTNAME", socket.gethostname() or "Linux-Server")\n',
)
if "        service_name=service_name," not in config:
    config = config.replace(
        "        agent_id=agent_id,\n",
        "        agent_id=agent_id,\n"
        "        agent_secret=agent_secret,\n"
        "        instance=instance,\n"
        "        service_name=service_name,\n",
    )
elif "        agent_secret=agent_secret," not in config:
    config = config.replace(
        "        agent_id=agent_id,\n",
        "        agent_id=agent_id,\n"
        "        agent_secret=agent_secret,\n",
    )
write(config_path, config)

main_path = base / "main.py"
main = main_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
main = main.replace(
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id)",
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name, settings.agent_secret)",
)
main = main.replace(
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name, settings.service_name)",
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name, settings.agent_secret)",
)
main = main.replace(
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name)",
    "run_agent(settings.websocket_url, settings.account_token, settings.hostname, settings.os_type, settings.agent_id, settings.service_name, settings.agent_secret)",
)
write(main_path, main)

agent_path = base / "agent.py"
agent = agent_path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
if "import shlex" not in agent:
    agent = agent.replace("import json\n", "import json\nimport shlex\n")
if "import re" not in agent:
    agent = agent.replace("import json\n", "import json\nimport re\n")
agent = agent.replace(
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "") -> None:',
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "", service_name: str = "processmanager-agent", agent_secret: str = "") -> None:',
)
agent = agent.replace(
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "", service_name: str = "processmanager-agent") -> None:',
    'async def run_agent(url: str, account_token: str, hostname: str, os_type: str, agent_id: str = "", service_name: str = "processmanager-agent", agent_secret: str = "") -> None:',
)
agent = agent.replace(
    '''                # STOMP CONNECT
                await websocket.send(stomp_frame(
                    "CONNECT",
                    {
                        "accept-version": "1.1,1.2",
                        "host": "localhost",
                        "account-token": account_token,
                        "hostname": hostname,
                        "os-type": os_type,
                        "agent-id": agent_id,
                        "self-ip": self_ip,
                    },
                ))
''',
    '''                # STOMP CONNECT
                connect_headers = {
                    "accept-version": "1.1,1.2",
                    "host": "localhost",
                    "hostname": hostname,
                    "os-type": os_type,
                    "agent-id": agent_id,
                    "self-ip": self_ip,
                }
                # 등록된 노드는 agent-secret을 우선 사용하고, 최초 등록/재설치는 account-token을 사용합니다.
                if agent_secret:
                    connect_headers["agent-secret"] = agent_secret
                else:
                    connect_headers["account-token"] = account_token
                await websocket.send(stomp_frame("CONNECT", connect_headers))
''',
)
agent = agent.replace(
    '''                print("[에이전트] 시스템 정보 요청 채널 구독 시작")
''',
    '''                print("[에이전트] 시스템 정보 요청 채널 구독 시작")
''',
)
agent = agent.replace(
    '"destination": "/topic/agent.command"',
    '"destination": f"/topic/agent.command.{agent_id}"',
)
agent = agent.replace(
    "'destination': '/topic/agent.command'",
    "'destination': f'/topic/agent.command.{agent_id}'",
)
agent = agent.replace(
    '''                # 시스템 정보 수집 요청 채널 구독
                await websocket.send(stomp_frame(
                    "SUBSCRIBE",
                    {
                        "id": SYSINFO_SUBSCRIPTION_ID,
                        "destination": "/topic/agent.sysinfo-request",
                        "ack": "auto",
                    },
                ))
''',
    '''                # 노드 전용 secret 수신 채널 구독
                await websocket.send(stomp_frame(
                    "SUBSCRIBE",
                    {
                        "id": "agent-secret-channel",
                        "destination": f"/topic/agent.secret.{agent_id}",
                        "ack": "auto",
                    },
                ))

                if not agent_secret:
                    # 등록 직후 서버가 발급한 agent-secret을 받을 준비가 끝났음을 알립니다.
                    await websocket.send(stomp_frame(
                        "SEND",
                        {"destination": "/app/agent.register-ready", "content-type": "application/json"},
                        json.dumps({"nodeName": hostname, "agentId": agent_id}),
                    ))

                # 시스템 정보 수집 요청 채널 구독
                await websocket.send(stomp_frame(
                    "SUBSCRIBE",
                    {
                        "id": SYSINFO_SUBSCRIPTION_ID,
                        "destination": f"/topic/agent.sysinfo-request.{agent_id}",
                        "ack": "auto",
                    },
                ))
''',
)
agent = agent.replace(
    '"destination": "/topic/agent.sysinfo-request"',
    '"destination": f"/topic/agent.sysinfo-request.{agent_id}"',
)
agent = agent.replace(
    "'destination': '/topic/agent.sysinfo-request'",
    "'destination': f'/topic/agent.sysinfo-request.{agent_id}'",
)
agent = agent.replace(
    '''                async def receive_commands_loop():
                    """백엔드에서 오는 명령(kill·터미널·시스템 정보·서비스 제어)을 수신하고 처리합니다."""
''',
    '''                async def receive_commands_loop():
                    """백엔드에서 오는 명령(kill·터미널·시스템 정보·서비스 제어)을 수신하고 처리합니다."""
                    nonlocal agent_secret
''',
)
update_index = agent.find('if cmd_type == "update":')
uninstall_index = agent.find('if cmd_type == "uninstall":')
terminal_index = agent.find('if cmd_type.startswith("terminal-")')
if min(update_index, uninstall_index, terminal_index) >= 0 and 'cmd_type == "agent-secret"' not in agent:
    update_start = line_start(agent, update_index)
    uninstall_start = line_start(agent, uninstall_index)
    update_block = '''                        if cmd_type == "agent-secret":
                            if payload.get("agentId") == agent_id:
                                new_secret = str(payload.get("agentSecret", "")).strip()
                                if new_secret:
                                    # 서버가 발급한 노드 전용 secret을 저장하고 1회용 설치 토큰은 로컬에서 비웁니다.
                                    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
                                    lines = []
                                    found_secret = False
                                    found_account_token = False
                                    if os.path.exists(env_path):
                                        with open(env_path, "r", encoding="utf-8") as fh:
                                            for line in fh.read().splitlines():
                                                if line.startswith("AGENT_SECRET="):
                                                    lines.append(f"AGENT_SECRET={new_secret}")
                                                    found_secret = True
                                                elif line.startswith("ACCOUNT_TOKEN="):
                                                    lines.append("ACCOUNT_TOKEN=")
                                                    found_account_token = True
                                                else:
                                                    lines.append(line)
                                    if not found_account_token:
                                        lines.insert(0, "ACCOUNT_TOKEN=")
                                    if not found_secret:
                                        lines.append(f"AGENT_SECRET={new_secret}")
                                    with open(env_path, "w", encoding="utf-8") as fh:
                                        fh.write("\\n".join(lines) + "\\n")
                                    agent_secret = new_secret
                                    print("[agent] agent secret saved")
                            continue

                        if cmd_type == "update":
                            if payload.get("agentId") == agent_id:
                                target_sha = str(payload.get("targetSha", "")).strip()
                                if not re.fullmatch(r"[0-9a-fA-F]{7,64}", target_sha):
                                    print("[agent] update command rejected: missing targetSha")
                                    continue
                                print("[agent] update command received; starting self-update")
                                import subprocess
                                agent_dir = os.path.dirname(os.path.abspath(__file__))
                                # Use the instance-specific systemd service so dev/prod agents do not overwrite each other.
                                safe_service_name = shlex.quote(service_name)
                                safe_target_sha = shlex.quote(target_sha)
                                cmds = ' && '.join([
                                    f'git -C {agent_dir} fetch --depth 1 origin master',
                                    f'git -C {agent_dir} checkout --detach {safe_target_sha}',
                                    f'{agent_dir}/.venv/bin/python -m pip install --disable-pip-version-check -r {agent_dir}/requirements.txt -q',
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
                            if payload.get("agentId") == agent_id:
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
                                import subprocess
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
# --node-name/PROCESS_MANAGER_NODE_NAME이 있거나 /dev/tty가 없으면(비대화형 설치) 프롬프트 없이 진행합니다.
if [ -z "$NODE_NAME" ] && pm_has_tty; then
    printf "Enter node name (press Enter to use system hostname): " > /dev/tty
    read -r NODE_NAME < /dev/tty || true
fi
if [ -z "$NODE_NAME" ]; then
    NODE_NAME=$(hostname)
fi
# 인스턴스 설치일 때 기본 hostname에 인스턴스 suffix를 붙여 개발/배포 노드명이 충돌하지 않게 합니다.
if [ -n "$INSTANCE" ] && [ "$NODE_NAME" = "$(hostname)" ]; then
    NODE_NAME="${NODE_NAME}-${INSTANCE}"
fi
echo "Node name: $NODE_NAME"

# ── 재설치 감지: 기존 AGENT_ID를 유지하고 설치본은 덮어씁니다. ──────
if [ -d "$INSTALL_DIR" ]; then
    echo "Existing installation detected. Reinstalling from scratch..."
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
echo " 터미널 사용자: $TERMINAL_USER"
echo "========================================"

# ── 의존성 확인 및 설치 ────────────────────────────────────
echo "[1/6] 의존성 확인..."
ensure_linux_dependencies

# ── 터미널 전용 저권한 사용자 ───────────────────────────────
if ! id -u "$TERMINAL_USER" >/dev/null 2>&1; then
    useradd -m -s "$TERMINAL_SHELL" "$TERMINAL_USER"
fi

# ── 에이전트 코드 설치 ─────────────────────────────────────
echo "[2/6] 에이전트 코드 설치..."
git clone -q "$REPO_URL" "$INSTALL_DIR"
if [ -z "$REPO_REF" ]; then
    # 기존 설치 명령어 호환을 위해 master 최신 커밋 설치는 유지하되, 고정되지 않은 버전임을 알립니다.
    pm_log "경고: 에이전트 버전(--ref)이 지정되지 않아 master 브랜치 최신 커밋으로 설치합니다. 재현 가능한 설치를 원하면 --ref <commit-sha>를 지정하세요."
else
    git -C "$INSTALL_DIR" fetch --depth 1 origin master
    git -C "$INSTALL_DIR" checkout --detach "$REPO_REF"
fi
# 런타임 패치는 --ref로 고정한 구버전 에이전트에만 필요합니다. 현재 버전에는 패치 내용이 이미 들어 있고,
# 패치하면 git에 로컬 변경으로 남아 이후 자동 업데이트의 checkout이 실패합니다. (pm-kill 래퍼 유무로 버전을 구분)
if [ ! -f "$INSTALL_DIR/scripts/linux/pm-kill" ]; then
    patch_agent_runtime_files
fi
# root로 설치할 래퍼 원본은 설치 디렉터리 소유권을 에이전트 사용자에게 넘기기 전에 root 전용 임시 폴더로 옮겨 둡니다.
# 넘긴 뒤에 읽으면 같은 사용자로 도는 다른 프로세스가 그 사이 원본을 바꾸거나 심볼릭 링크로 바꿔칠 수 있습니다.
WRAPPER_STAGE=$(mktemp -d)
chmod 700 "$WRAPPER_STAGE"
for wrapper in pm-kill pm-service; do
    wrapper_src="$INSTALL_DIR/scripts/linux/$wrapper"
    if [ -f "$wrapper_src" ] && [ ! -L "$wrapper_src" ]; then
        tr -d '\r' < "$wrapper_src" > "$WRAPPER_STAGE/$wrapper"
    fi
done
chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"

# ── 가상환경 및 의존성 ─────────────────────────────────────
echo "[3/6] Python 가상환경 및 의존성 설치..."
sudo -u "$AGENT_USER" env PIP_DISABLE_PIP_VERSION_CHECK=1 python3 -m venv "$INSTALL_DIR/.venv"
# 설치 디렉터리는 매번 지워지지만 ~/.cache/pip는 유지되므로 캐시를 켜 재설치 시 wheel 재다운로드를 피합니다.
# 에이전트 저장소에 해시가 포함된 requirements.lock이 있으면 공급망 변조를 막기 위해 --require-hashes로 설치합니다.
if [ -f "$INSTALL_DIR/requirements.lock" ] && grep -q -- '--hash=' "$INSTALL_DIR/requirements.lock"; then
    pm_log "requirements.lock 해시 검증 설치"
    sudo -u "$AGENT_USER" env PIP_DISABLE_PIP_VERSION_CHECK=1 "$INSTALL_DIR/.venv/bin/python" -m pip install --disable-pip-version-check --require-hashes -r "$INSTALL_DIR/requirements.lock" -q
else
    sudo -u "$AGENT_USER" env PIP_DISABLE_PIP_VERSION_CHECK=1 "$INSTALL_DIR/.venv/bin/python" -m pip install --disable-pip-version-check -r "$INSTALL_DIR/requirements.txt" -q
fi

# ── 환경변수 파일 생성 ─────────────────────────────────────
# curl | bash 환경에서 heredoc이 stdin 충돌로 빈 파일을 생성하는 문제를 방지하기 위해 printf 사용
echo "[4/6] 환경변수 설정..."
# 다른 dev/prod 인스턴스가 이미 쓰는 포트와 충돌하지 않도록 비어 있는 포트를 고릅니다.
AGENT_PORT=$(choose_agent_port "$EXISTING_AGENT_PORT")
echo " 에이전트 API 포트: $AGENT_PORT"
# 에이전트가 업데이트/삭제 시 자기 systemd 서비스명을 정확히 제어할 수 있도록 SERVICE_NAME을 저장합니다.
# umask 077을 서브셸에만 적용해 .env가 생성 순간부터 소유자 전용(0600)이 되도록 합니다. (chmod 전 노출 방지)
(
    umask 077
    rm -f "$INSTALL_DIR/.env"
    printf 'ACCOUNT_TOKEN=%s\nAGENT_SECRET=\nSPRING_WS_URL=%s/ws-native\nOS_TYPE=Linux\nAGENT_PORT=%s\nLINUX_API_RELOAD=false\nHOSTNAME=%s\nAGENT_ID=%s\nINSTANCE=%s\nSERVICE_NAME=%s\nTERMINAL_USER=%s\nTERMINAL_SHELL=%s\n' \
        "$TOKEN" "$WS_URL" "$AGENT_PORT" "$NODE_NAME" "$AGENT_ID" "${INSTANCE:-default}" "$SERVICE_NAME" "$TERMINAL_USER" "$TERMINAL_SHELL" > "$INSTALL_DIR/.env"
)
chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# ── sudoers 설정 (에이전트가 실제로 sudo로 실행하는 명령만 비밀번호 없이 허용) ───────────
# 에이전트 pm_agent/platforms/linux/security.py의 build_agent_sudoers와 같은 규칙입니다. 한쪽을 바꾸면 함께 바꿉니다.
# 프로세스 종료/서비스 제어는 `kill -9 [0-9]*`, `systemctl start *.service` 같은 와일드카드가
# 공백까지 매칭돼(`kill -9 1 -1`, `systemctl stop sshd.service` 등) 악용될 수 있으므로,
# 인자를 하나씩 검증하는 root 소유 래퍼(pm-kill/pm-service)만 허용합니다.
echo "[5/6] sudo 권한 설정..."
WRAPPER_DIR="/usr/local/lib/processmanager"
PM_KILL_PATH="$WRAPPER_DIR/pm-kill"
PM_SERVICE_PATH="$WRAPPER_DIR/pm-service"
DMIDECODE_PATH=$(command -v dmidecode 2>/dev/null || echo /usr/sbin/dmidecode)
case "$DMIDECODE_PATH" in /*) ;; *) DMIDECODE_PATH=/usr/sbin/dmidecode ;; esac

# 래퍼 원본은 에이전트 저장소(scripts/linux)에 있습니다. CR을 제거해 root:root 0755로 설치하고,
# 에이전트 사용자가 수정할 수 없도록 디렉터리도 root 소유로 둡니다.
install -d -m 0755 -o root -g root "$WRAPPER_DIR"
for wrapper in pm-kill pm-service; do
    wrapper_staged="$WRAPPER_STAGE/$wrapper"
    if [ -s "$wrapper_staged" ]; then
        wrapper_tmp=$(mktemp "$WRAPPER_DIR/.${wrapper}.XXXXXX")
        cat "$wrapper_staged" > "$wrapper_tmp"
        chown root:root "$wrapper_tmp"
        chmod 0755 "$wrapper_tmp"
        mv -f "$wrapper_tmp" "$WRAPPER_DIR/$wrapper"
    else
        pm_log "경고: 에이전트 저장소에 scripts/linux/$wrapper 가 없어 래퍼를 설치하지 못했습니다. (구버전 에이전트) 프로세스 종료/서비스 제어가 제한될 수 있습니다."
    fi
done
rm -rf "$WRAPPER_STAGE"

{
    printf '%s ALL=(root) NOPASSWD: %s restart %s, %s stop %s, %s disable %s, %s daemon-reload, %s -f /etc/systemd/system/%s.service, %s, %s, %s -t 17, %s -t memory\n' \
        "$AGENT_USER" "$SYSTEMCTL_PATH" "$SERVICE_NAME" "$SYSTEMCTL_PATH" "$SERVICE_NAME" \
        "$SYSTEMCTL_PATH" "$SERVICE_NAME" "$SYSTEMCTL_PATH" "$RM_PATH" "$SERVICE_NAME" \
        "$PM_KILL_PATH" "$PM_SERVICE_PATH" "$DMIDECODE_PATH" "$DMIDECODE_PATH"
    # 원격 터미널은 root가 아닌 TERMINAL_USER로만 전환합니다.
    if [ "$TERMINAL_USER" != "root" ] && [ "$TERMINAL_USER" != "$AGENT_USER" ]; then
        printf '%s ALL=(%s) NOPASSWD: %s --login\n' "$AGENT_USER" "$TERMINAL_USER" "$TERMINAL_SHELL"
    fi
} > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"
if command -v visudo >/dev/null 2>&1 && ! visudo -cf "$SUDOERS_FILE" >/dev/null; then
    rm -f "$SUDOERS_FILE"
    echo "sudoers 규칙 검증에 실패해 설치를 중단합니다." >&2
    exit 1
fi
printf 'limited-sudoers-v3\ninstalled by install.sh\n' > "$INSTALL_DIR/.sudoers_hardening_checked"
chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.sudoers_hardening_checked"

# ── systemd 서비스 등록 ────────────────────────────────────
echo "[6/6] systemd 서비스 등록..."
# systemd 하드닝은 에이전트 기능과 충돌하지 않는 항목만 적용합니다.
# - PrivateTmp=yes: 서비스 전용 /tmp를 사용합니다. (원격 터미널 세션도 이 전용 /tmp를 보게 됩니다)
# - NoNewPrivileges는 넣지 않습니다. 켜면 setuid 바이너리인 sudo가 동작하지 않아 업데이트/삭제 시 sudo systemctl 호출이 실패합니다.
# - ProtectSystem=full은 넣지 않습니다. sudo로 실행한 자식 프로세스도 같은 마운트 네임스페이스라 /etc/systemd/system 서비스 파일 삭제가 실패합니다.
# - ProtectHome=read-only는 넣지 않습니다. 원격 터미널의 홈 디렉터리 쓰기와 pip 캐시(~/.cache/pip) 갱신이 막힙니다.
printf '[Unit]\nDescription=Process Manager Agent\nAfter=network.target\nStartLimitIntervalSec=0\n\n[Service]\nType=simple\nUser=%s\nWorkingDirectory=%s\nEnvironment=PYTHONUNBUFFERED=1\nExecStart=%s/.venv/bin/python main.py\nRestart=always\nRestartSec=60\nStandardOutput=journal\nStandardError=journal\nPrivateTmp=yes\n\n[Install]\nWantedBy=multi-user.target\n' \
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
