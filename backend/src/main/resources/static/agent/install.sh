#!/bin/bash
# Process Manager Agent 설치 스크립트
# 사용법: curl -sSL <server>/agent/install.sh | sudo bash -s -- --server <url> --token <token> [--instance <name>]
set -e

REPO_URL="https://github.com/duwon1/processManager-agent.git"
BASE_INSTALL_DIR="/opt/processManager-agent"
BASE_SERVICE_NAME="processmanager-agent"
BASE_SUDOERS_FILE="/etc/sudoers.d/processmanager"
BASE_AGENT_PORT=8888
MAX_AGENT_PORT=8999

# ── 인자 파싱 ──────────────────────────────────────────────
SERVER_URL=""
TOKEN=""
INSTANCE=""
AGENT_USER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
TERMINAL_USER="${PROCESS_MANAGER_TERMINAL_USER:-processmanager-terminal}"
TERMINAL_SHELL="$(command -v bash || echo /bin/bash)"

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
            apt-get update -qq
            apt-get install -y "$@" -qq
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
if 'cmd_type == "file-list"' not in agent:
    agent = agent.replace(
        '''                        # ── 업데이트 명령 처리 ──
''',
        '''                        # ── 파일 목록 요청 처리 ──
                        if cmd_type == "file-list":
                            try:
                                from pathlib import Path

                                requested_path = str(payload.get("path", "") or "").strip()
                                target = Path(requested_path).expanduser() if requested_path else Path.home()
                                if not target.is_absolute():
                                    target = (Path.home() / target).resolve()
                                else:
                                    target = target.resolve()

                                entries = []
                                if target.is_dir():
                                    for child in sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
                                        try:
                                            stat = child.stat()
                                            entries.append({
                                                "name": child.name,
                                                "path": str(child),
                                                "type": "directory" if child.is_dir() else "file",
                                                "size": stat.st_size,
                                                "modified": int(stat.st_mtime),
                                                "hidden": child.name.startswith("."),
                                            })
                                        except OSError:
                                            entries.append({
                                                "name": child.name,
                                                "path": str(child),
                                                "type": "unknown",
                                                "size": 0,
                                                "modified": 0,
                                                "hidden": child.name.startswith("."),
                                            })
                                    response = {
                                        "path": str(target),
                                        "parent": str(target.parent) if target.parent != target else "",
                                        "entries": entries,
                                        "error": "",
                                    }
                                else:
                                    response = {
                                        "path": str(target),
                                        "parent": str(target.parent),
                                        "entries": [],
                                        "error": "디렉토리가 아닙니다.",
                                    }
                            except Exception as e:
                                response = {
                                    "path": str(payload.get("path", "") or ""),
                                    "parent": "",
                                    "entries": [],
                                    "error": str(e),
                                }

                            await websocket.send(stomp_frame(
                                "SEND",
                                {"destination": "/app/file-list.result", "content-type": "application/json"},
                                json.dumps(response),
                            ))
                            continue

                        # ── 업데이트 명령 처리 ──
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
                                print("[agent] update command received; starting self-update")
                                import subprocess
                                agent_dir = os.path.dirname(os.path.abspath(__file__))
                                # Use the instance-specific systemd service so dev/prod agents do not overwrite each other.
                                safe_service_name = shlex.quote(service_name)
                                cmds = ' && '.join([
                                    f'git -C {agent_dir} pull origin master',
                                    f'{agent_dir}/.venv/bin/python -m pip install --no-cache-dir --disable-pip-version-check -r {agent_dir}/requirements.txt -q',
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
patch_agent_runtime_files
chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"

# ── 가상환경 및 의존성 ─────────────────────────────────────
echo "[3/6] Python 가상환경 및 의존성 설치..."
sudo -u "$AGENT_USER" env PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 python3 -m venv "$INSTALL_DIR/.venv"
sudo -u "$AGENT_USER" env PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 "$INSTALL_DIR/.venv/bin/python" -m pip install --no-cache-dir --disable-pip-version-check -r "$INSTALL_DIR/requirements.txt" -q

# ── 환경변수 파일 생성 ─────────────────────────────────────
# curl | bash 환경에서 heredoc이 stdin 충돌로 빈 파일을 생성하는 문제를 방지하기 위해 printf 사용
echo "[4/6] 환경변수 설정..."
# 다른 dev/prod 인스턴스가 이미 쓰는 포트와 충돌하지 않도록 비어 있는 포트를 고릅니다.
AGENT_PORT=$(choose_agent_port "$EXISTING_AGENT_PORT")
echo " 에이전트 API 포트: $AGENT_PORT"
# 에이전트가 업데이트/삭제 시 자기 systemd 서비스명을 정확히 제어할 수 있도록 SERVICE_NAME을 저장합니다.
printf 'ACCOUNT_TOKEN=%s\nAGENT_SECRET=\nSPRING_WS_URL=%s/ws-native\nOS_TYPE=Linux\nAGENT_PORT=%s\nLINUX_API_RELOAD=false\nHOSTNAME=%s\nAGENT_ID=%s\nINSTANCE=%s\nSERVICE_NAME=%s\nTERMINAL_USER=%s\nTERMINAL_SHELL=%s\n' \
    "$TOKEN" "$WS_URL" "$AGENT_PORT" "$NODE_NAME" "$AGENT_ID" "${INSTANCE:-default}" "$SERVICE_NAME" "$TERMINAL_USER" "$TERMINAL_SHELL" > "$INSTALL_DIR/.env"
chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"

# ── sudoers 설정 (에이전트 서비스 관리에 필요한 최소 권한) ─────────────────────
echo "[5/6] sudo 권한 설정..."
SYSTEMCTL_BIN=$(command -v systemctl)
RM_BIN=$(command -v rm)
DMIDECODE_BIN=$(command -v dmidecode || echo /usr/sbin/dmidecode)
{
    printf '%s ALL=(root) NOPASSWD: %s restart %s\n' "$AGENT_USER" "$SYSTEMCTL_BIN" "$SERVICE_NAME"
    printf '%s ALL=(root) NOPASSWD: %s stop %s\n' "$AGENT_USER" "$SYSTEMCTL_BIN" "$SERVICE_NAME"
    printf '%s ALL=(root) NOPASSWD: %s disable %s\n' "$AGENT_USER" "$SYSTEMCTL_BIN" "$SERVICE_NAME"
    printf '%s ALL=(root) NOPASSWD: %s daemon-reload\n' "$AGENT_USER" "$SYSTEMCTL_BIN"
    printf '%s ALL=(root) NOPASSWD: %s -f /etc/systemd/system/%s.service\n' "$AGENT_USER" "$RM_BIN" "$SERVICE_NAME"
    printf '%s ALL=(root) NOPASSWD: %s -t memory\n' "$AGENT_USER" "$DMIDECODE_BIN"
    printf '%s ALL=(root) NOPASSWD: %s -t 17\n' "$AGENT_USER" "$DMIDECODE_BIN"
    if [ "$TERMINAL_USER" != "$AGENT_USER" ]; then
        printf '%s ALL=(%s) NOPASSWD: %s --login\n' "$AGENT_USER" "$TERMINAL_USER" "$TERMINAL_SHELL"
    fi
} > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"
printf 'limited-sudoers-v3\ninstalled by install.sh\n' > "$INSTALL_DIR/.sudoers_hardening_checked"
chown "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR/.sudoers_hardening_checked"

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
