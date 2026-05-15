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

function Test-InstallToken([string]$ServerUrl, [string]$InstallToken) {
    $validateUrl = $ServerUrl.TrimEnd("/") + "/api/agent/install-token/validate"
    $body = @{ installToken = $InstallToken } | ConvertTo-Json -Compress
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
    $py = Resolve-CommandPath @("py")
    if ($py) {
        return @{ File = $py; Prefix = @("-3") }
    }

    $python = Resolve-CommandPath @("python", "python3")
    if ($python) {
        return @{ File = $python; Prefix = @() }
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

function Write-RunnerScript([string]$InstallDir) {
    $runnerPath = Join-Path $InstallDir "run-agent.ps1"
    $content = @'
$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot
$logDir = Join-Path $PSScriptRoot "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$logFile = Join-Path $logDir "agent.log"
$python = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
& $python main.py *>> $logFile
'@
    Write-Utf8NoBom $runnerPath $content
    return $runnerPath
}

function Register-AgentTask([string]$TaskName, [string]$RunnerPath) {
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerPath`""
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
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
Test-InstallToken $normalizedServer $Token
$instanceSuffix = if ([string]::IsNullOrWhiteSpace($Instance)) { "" } else { "-$Instance" }
$installDir = "$BaseInstallDir$instanceSuffix"
$taskName = "$BaseTaskName$instanceSuffix"
$envPath = Join-Path $installDir ".env"

if ([string]::IsNullOrWhiteSpace($NodeName)) {
    $NodeName = $env:COMPUTERNAME
    if (-not [string]::IsNullOrWhiteSpace($Instance)) {
        $NodeName = "$NodeName-$Instance"
    }
}

Write-Host "========================================"
Write-Host " Process Manager Agent Windows installer"
Write-Host "========================================"
Write-Step "Install directory: $installDir"
Write-Step "Scheduled task: $taskName"

$existingEnv = Read-DotEnv $envPath
$existingAgentId = if ($existingEnv.ContainsKey("AGENT_ID")) { $existingEnv["AGENT_ID"] } else { "" }
$existingPort = if ($existingEnv.ContainsKey("AGENT_PORT")) { $existingEnv["AGENT_PORT"] } else { "" }

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
Invoke-Python $pythonCommand @("-m", "venv", (Join-Path $installDir ".venv"))
$venvPython = Join-Path $installDir ".venv\Scripts\python.exe"
& $venvPython -m pip install -r (Join-Path $installDir "requirements.txt") -q

$agentId = if ([string]::IsNullOrWhiteSpace($existingAgentId)) { [Guid]::NewGuid().ToString() } else { $existingAgentId }
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

$runnerPath = Write-RunnerScript $installDir

Write-Step "Registering scheduled task..."
Register-AgentTask $taskName $runnerPath

Write-Step "Starting agent..."
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "========================================"
Write-Host " Install complete."
Write-Host " Task status: Get-ScheduledTask -TaskName $taskName"
Write-Host " Log file: $installDir\logs\agent.log"
Write-Host "========================================"
