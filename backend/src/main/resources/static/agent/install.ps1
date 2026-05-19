param(
    [Parameter(Mandatory = $true)]
    [string]$Server,

    [Parameter(Mandatory = $true)]
    [string]$Token,

    [string]$Instance = "",
    [string]$NodeName = "",
    [string]$RepoUrl = "https://github.com/duwon1/processManager-agent.git",
    [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$BaseInstallDir = Join-Path $env:LOCALAPPDATA "ProcessManagerAgent"
$BaseTaskName = "ProcessManagerAgent"
$BaseAgentPort = 8888
$MaxAgentPort = 8999

function Write-Step([string]$Message) {
    Write-Host "[process-manager] $Message"
}

function Stop-Install([string]$Message) {
    Write-Host "[process-manager] 설치 실패: $Message"
    exit 1
}

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InstallRequestHeaders([string]$ServerUrl) {
    if ($ServerUrl -match "ngrok-free\.dev|ngrok-free\.app|ngrok\.io") {
        return @{ "ngrok-skip-browser-warning" = "true" }
    }
    return @{}
}

function Test-InstallToken([string]$ServerUrl, [string]$InstallToken, [string]$AgentId) {
    $validateUrl = $ServerUrl.TrimEnd("/") + "/api/agent/install-token/claim"
    $body = @{ installToken = $InstallToken; agentId = $AgentId } | ConvertTo-Json -Compress
    $headers = Get-InstallRequestHeaders $ServerUrl

    Write-Step "설치 명령어 확인 중..."
    try {
        if ($headers.Count -gt 0) {
            $response = Invoke-RestMethod -Uri $validateUrl -Method Post -ContentType "application/json" -Body $body -Headers $headers -TimeoutSec 15
        } else {
            $response = Invoke-RestMethod -Uri $validateUrl -Method Post -ContentType "application/json" -Body $body -TimeoutSec 15
        }
    } catch {
        Stop-Install "서버에 연결할 수 없습니다. 서버 주소와 네트워크를 확인하세요."
    }

    $validProperty = if ($response) { $response.PSObject.Properties["valid"] } else { $null }
    if ($validProperty -and $response.valid -eq $true) {
        Write-Step "설치 명령어 확인 완료"
        return
    }

    $codeProperty = if ($response) { $response.PSObject.Properties["code"] } else { $null }
    $code = if ($codeProperty -and $response.code) { [string]$response.code } else { "" }
    $mappedMessage = switch ($code) {
        "TOKEN_REQUIRED" { "설치 명령어가 올바르지 않습니다."; break }
        "TOKEN_INVALID_FORMAT" { "설치 명령어가 올바르지 않습니다."; break }
        "TOKEN_UNAVAILABLE" { "설치 명령어가 만료되었거나 이미 사용되었습니다."; break }
        default { "" }
    }
    if (-not [string]::IsNullOrWhiteSpace($mappedMessage)) {
        Stop-Install $mappedMessage
    }

    $messageProperty = if ($response) { $response.PSObject.Properties["message"] } else { $null }
    $detailProperty = if ($response) { $response.PSObject.Properties["detail"] } else { $null }
    $message = if ($messageProperty -and $response.message) {
        [string]$response.message
    } elseif ($detailProperty -and $response.detail) {
        [string]$response.detail
    } else {
        "서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도하세요."
    }
    Stop-Install $message
}

function Assert-ValidInstance([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }
    if ($Value -notmatch "^[a-zA-Z0-9_-]+$") {
        throw "Instance must contain only letters, numbers, hyphen, or underscore."
    }
}

function Convert-ToWebSocketUrl([string]$Value) {
    $trimmed = $Value.TrimEnd("/")
    if ($trimmed.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase)) {
        return "wss://" + $trimmed.Substring(8)
    }
    if ($trimmed.StartsWith("http://", [StringComparison]::OrdinalIgnoreCase)) {
        return "ws://" + $trimmed.Substring(7)
    }
    throw "Server must start with http:// or https://."
}

function Read-DotEnv([string]$Path) {
    $values = @{}
    if (-not (Test-Path -LiteralPath $Path)) {
        return $values
    }

    foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) {
            continue
        }
        $parts = $trimmed.Split("=", 2)
        $values[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $values
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    $encoding = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Resolve-CommandPath([string[]]$Names) {
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) {
            return $command.Source
        }
    }
    return $null
}

function Install-WithWinget([string]$PackageId, [string]$DisplayName) {
    $winget = Resolve-CommandPath @("winget")
    if (-not $winget) {
        return $false
    }

    Write-Step "Installing $DisplayName with winget..."
    & $winget install --id $PackageId -e --source winget --accept-package-agreements --accept-source-agreements
    return ($LASTEXITCODE -eq 0)
}

function Resolve-GitPath {
    $git = Resolve-CommandPath @("git")
    if ($git) {
        return $git
    }

    $candidates = @()
    if ($env:ProgramFiles) {
        $candidates += (Join-Path $env:ProgramFiles "Git\cmd\git.exe")
    }
    if (${env:ProgramFiles(x86)}) {
        $candidates += (Join-Path ${env:ProgramFiles(x86)} "Git\cmd\git.exe")
    }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    if (Install-WithWinget "Git.Git" "Git") {
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        return Resolve-GitPath
    }

    return $null
}

function Resolve-PythonCommand {
    function Test-PythonCandidate([hashtable]$Candidate) {
        try {
            $version = & $Candidate.File @($Candidate.Prefix + @("-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")) 2>$null
            $parts = "$version".Trim().Split(".", 2)
            if ($parts.Count -lt 2) {
                return $false
            }
            $major = [int]$parts[0]
            $minor = [int]$parts[1]
            return ($major -gt 3 -or ($major -eq 3 -and $minor -ge 10))
        } catch {
            return $false
        }
    }

    $py = Resolve-CommandPath @("py")
    if ($py) {
        $candidate = @{ File = $py; Prefix = @("-3") }
        if (Test-PythonCandidate $candidate) {
            return $candidate
        }
    }

    $python = Resolve-CommandPath @("python", "python3")
    if ($python) {
        $candidate = @{ File = $python; Prefix = @() }
        if (Test-PythonCandidate $candidate) {
            return $candidate
        }
    }

    if (Install-WithWinget "Python.Python.3.11" "Python 3.11") {
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
        return Resolve-PythonCommand
    }

    return $null
}

function Invoke-Python([hashtable]$PythonCommand, [string[]]$Arguments) {
    & $PythonCommand.File @($PythonCommand.Prefix + $Arguments)
}

function Assert-PythonVersion([hashtable]$PythonCommand) {
    $version = Invoke-Python $PythonCommand @("-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
    $parts = "$version".Trim().Split(".", 2)
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    if ($major -lt 3 -or ($major -eq 3 -and $minor -lt 10)) {
        throw "Python 3.10 or newer is required. Detected: $version"
    }
}

function Test-PortAvailable([int]$Port) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    try {
        $listener.Start()
        return $true
    } catch {
        return $false
    } finally {
        $listener.Stop()
    }
}

function Choose-AgentPort([string]$PreferredPort) {
    $parsed = 0
    if ([int]::TryParse($PreferredPort, [ref]$parsed) -and (Test-PortAvailable $parsed)) {
        return $parsed
    }

    for ($port = $BaseAgentPort; $port -le $MaxAgentPort; $port++) {
        if (Test-PortAvailable $port) {
            return $port
        }
    }

    throw "No available agent port found in range $BaseAgentPort-$MaxAgentPort."
}

function Stop-AndRemoveTask([string]$TaskName) {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $task) {
        return
    }

    try {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    } catch {
    }
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

function Install-AgentSource([string]$GitPath, [string]$TargetDir, [string]$RepositoryUrl, [string]$RepositoryBranch) {
    if ($GitPath) {
        & $GitPath clone --depth 1 --branch $RepositoryBranch $RepositoryUrl $TargetDir
        if ($LASTEXITCODE -eq 0) {
            return
        }
        throw "git clone failed."
    }

    Write-Step "Git is not available. Downloading repository archive instead..."
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("processmanager-agent-" + [Guid]::NewGuid().ToString("N"))
    $zipPath = Join-Path $tempRoot "agent.zip"
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    try {
        $archiveUrl = "https://github.com/duwon1/processManager-agent/archive/refs/heads/$RepositoryBranch.zip"
        Invoke-WebRequest -Uri $archiveUrl -OutFile $zipPath
        Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force
        $sourceRoot = Get-ChildItem -LiteralPath $tempRoot -Directory | Where-Object { $_.Name -like "processManager-agent-*" } | Select-Object -First 1
        if (-not $sourceRoot) {
            throw "Downloaded archive did not contain the agent source."
        }
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
        Copy-Item -Path (Join-Path $sourceRoot.FullName "*") -Destination $TargetDir -Recurse -Force
    } finally {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Write-RunnerScripts([string]$InstallDir) {
    $psRunnerPath = Join-Path $InstallDir "run-agent.ps1"
    $pywRunnerPath = Join-Path $InstallDir "run-agent.pyw"
    $psContent = @'
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "agent.log"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$env:PYTHONUNBUFFERED = "1"
$ErrorActionPreference = "Continue"
& $python main.py >> $logFile 2>&1
exit $LASTEXITCODE
'@
    $pywContent = @'
from pathlib import Path
import os
import runpy
import sys
import traceback

base_dir = Path(__file__).resolve().parent
os.chdir(base_dir)

log_dir = base_dir / "logs"
log_dir.mkdir(exist_ok=True)
log_file = log_dir / "agent.log"

with log_file.open("a", encoding="utf-8", buffering=1) as log:
    sys.stdout = log
    sys.stderr = log
    os.environ["PYTHONUNBUFFERED"] = "1"
    try:
        runpy.run_path(str(base_dir / "main.py"), run_name="__main__")
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise
'@
    Write-Utf8NoBom $psRunnerPath $psContent
    Write-Utf8NoBom $pywRunnerPath $pywContent
    return $pywRunnerPath
}

function Register-AgentTask([string]$TaskName, [string]$RunnerPath, [string]$InstallDir) {
    $pythonw = Join-Path $InstallDir ".venv\Scripts\pythonw.exe"
    if (-not (Test-Path -LiteralPath $pythonw)) {
        throw "pythonw.exe was not found in the virtual environment."
    }

    $action = New-ScheduledTaskAction `
        -Execute $pythonw `
        -Argument "`"$RunnerPath`"" `
        -WorkingDirectory $InstallDir
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
    $watchdogTrigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date).AddMinutes(1) `
        -RepetitionInterval (New-TimeSpan -Minutes 1) `
        -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -MultipleInstances IgnoreNew `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal `
        -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
        -LogonType Interactive `
        -RunLevel Highest

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger @($logonTrigger, $watchdogTrigger) `
        -Settings $settings `
        -Principal $principal `
        -Description "Process Manager Agent" `
        -Force | Out-Null
}

if ([string]::IsNullOrWhiteSpace($Server) -or [string]::IsNullOrWhiteSpace($Token)) {
    throw "Server and Token are required."
}

if (-not (Test-IsAdministrator)) {
    Stop-Install "관리자 권한 PowerShell에서 실행해야 합니다. 시작 메뉴에서 PowerShell을 우클릭한 뒤 '관리자 권한으로 실행'을 선택하세요."
}

Assert-ValidInstance $Instance

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$normalizedServer = $Server.TrimEnd("/")
$wsUrl = Convert-ToWebSocketUrl $normalizedServer
$instanceSuffix = if ([string]::IsNullOrWhiteSpace($Instance)) { "" } else { "-$Instance" }
$installDir = "$BaseInstallDir$instanceSuffix"
$taskName = "$BaseTaskName$instanceSuffix"
$envPath = Join-Path $installDir ".env"

$defaultNodeName = $env:COMPUTERNAME
if (-not [string]::IsNullOrWhiteSpace($Instance)) {
    $defaultNodeName = "$defaultNodeName-$Instance"
}

if ([string]::IsNullOrWhiteSpace($NodeName)) {
    $inputNodeName = Read-Host "노드 이름을 입력하세요 (Enter: $defaultNodeName)"
    $NodeName = if ([string]::IsNullOrWhiteSpace($inputNodeName)) { $defaultNodeName } else { $inputNodeName.Trim() }
} else {
    $NodeName = $NodeName.Trim()
}

Write-Host "========================================"
Write-Host " Process Manager Agent Windows installer"
Write-Host "========================================"
Write-Step "노드 이름: $NodeName"
Write-Step "Install directory: $installDir"
Write-Step "Scheduled task: $taskName"

$existingEnv = Read-DotEnv $envPath
$existingAgentId = if ($existingEnv.ContainsKey("AGENT_ID")) { $existingEnv["AGENT_ID"] } else { "" }
$existingPort = if ($existingEnv.ContainsKey("AGENT_PORT")) { $existingEnv["AGENT_PORT"] } else { "" }
$agentId = if ([string]::IsNullOrWhiteSpace($existingAgentId)) { [Guid]::NewGuid().ToString() } else { $existingAgentId }

Test-InstallToken $normalizedServer $Token $agentId

Write-Step "Stopping previous scheduled task if it exists..."
Stop-AndRemoveTask $taskName

if (Test-Path -LiteralPath $installDir) {
    Write-Step "Removing previous install directory..."
    Remove-Item -LiteralPath $installDir -Recurse -Force
}

$parentDir = Split-Path -Parent $installDir
New-Item -ItemType Directory -Path $parentDir -Force | Out-Null

Write-Step "Checking Python..."
$pythonCommand = Resolve-PythonCommand
if (-not $pythonCommand) {
    throw "Python 3.10+ is required. Install Python first, then run this installer again."
}
Assert-PythonVersion $pythonCommand

Write-Step "Checking Git..."
$gitPath = Resolve-GitPath

Write-Step "Installing agent source..."
Install-AgentSource $gitPath $installDir $RepoUrl $Branch

Write-Step "Creating Python virtual environment..."
$env:PIP_NO_CACHE_DIR = "1"
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
Invoke-Python $pythonCommand @("-m", "venv", (Join-Path $installDir ".venv"))
$venvPython = Join-Path $installDir ".venv\Scripts\python.exe"
& $venvPython -m ensurepip --upgrade
& $venvPython -m pip install --no-cache-dir --disable-pip-version-check --upgrade pip -q
& $venvPython -m pip install --no-cache-dir --disable-pip-version-check -r (Join-Path $installDir "requirements.txt") -q

$agentPort = Choose-AgentPort $existingPort

Write-Step "Writing environment file..."
$envContent = @"
ACCOUNT_TOKEN=$Token
AGENT_SECRET=
SPRING_WS_URL=$wsUrl/ws-native
OS_TYPE=Windows
AGENT_PORT=$agentPort
LINUX_API_RELOAD=false
HOSTNAME=$NodeName
AGENT_ID=$agentId
INSTANCE=$(if ([string]::IsNullOrWhiteSpace($Instance)) { "default" } else { $Instance })
SERVICE_NAME=$taskName
"@
Write-Utf8NoBom $envPath ($envContent.TrimEnd() + "`n")

$runnerPath = Write-RunnerScripts $installDir

Write-Step "Registering scheduled task..."
Register-AgentTask $taskName $runnerPath $installDir

Write-Step "Starting agent..."
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "========================================"
Write-Host " Install complete."
Write-Host " Task status: Get-ScheduledTask -TaskName $taskName"
Write-Host " Log file: $installDir\logs\agent.log"
Write-Host "========================================"
