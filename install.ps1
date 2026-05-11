# equium-fast-miner - Windows installer
# Запускай из папки репозитория в PowerShell от имени Администратора:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   .\install.ps1

$ErrorActionPreference = "Stop"

function info    { Write-Host "[>>] $args" -ForegroundColor Cyan }
function success { Write-Host "[OK] $args" -ForegroundColor Green }
function warn    { Write-Host "[!!] $args" -ForegroundColor Yellow }
function die     { Write-Host "[XX] $args" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "   EQUIUM FAST MINER - Windows installer" -ForegroundColor Cyan
Write-Host "   ~5x optimised Equihash solver  EQM" -ForegroundColor Cyan
Write-Host "   ------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Проверить что запущен от Администратора
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")
if (-not $isAdmin) {
    die "Запусти PowerShell от имени Администратора (правая кнопка -> Запуск от администратора)"
}

# Проверить что мы в папке репозитория
if (-not (Test-Path "Cargo.toml")) {
    die "Запусти скрипт из папки репозитория: cd equium-master && .\install.ps1"
}
$REPO_DIR = (Get-Location).Path
info "Репозиторий: $REPO_DIR"

# 1. Chocolatey
Write-Host ""
info "Проверяю Chocolatey..."
if (-not (Get-Command choco -ErrorAction SilentlyContinue)) {
    info "Устанавливаю Chocolatey..."
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    success "Chocolatey установлен"
} else {
    success "Chocolatey уже есть"
}

# 2. Visual Studio Build Tools
Write-Host ""
info "Проверяю Visual C++ Build Tools..."
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = $false
if (Test-Path $vsWhere) {
    $vs = & $vsWhere -products * -requires Microsoft.VisualCpp.Tools.HostX64.TargetX64 -format json 2>$null | ConvertFrom-Json
    if ($vs.Count -gt 0) { $hasBuildTools = $true }
}
if (-not $hasBuildTools) {
    info "Устанавливаю Visual Studio Build Tools (~2 GB, займет 5-10 минут)..."
    choco install visualstudio2022buildtools -y --package-parameters "--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --quiet"
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    success "Build Tools установлены"
} else {
    success "Visual C++ Build Tools уже есть"
}

# 3. Git
Write-Host ""
info "Проверяю Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    info "Устанавливаю Git..."
    choco install git -y
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    success "Git установлен"
} else {
    success "Git уже есть"
}

# 4. Rust
Write-Host ""
info "Проверяю Rust..."
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) {
    info "Устанавливаю Rust..."
    $rustupExe = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $rustupExe
    & $rustupExe -y --default-toolchain stable --profile minimal
    $env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
    success "Rust установлен"
} else {
    info "rustup найден, обновляю..."
    rustup update stable
    success "Rust обновлен"
}
$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path
$rustVer = rustc --version
success "Rust: $rustVer"

# 5. OpenSSL через vcpkg
Write-Host ""
info "Устанавливаю OpenSSL через vcpkg..."

$vcpkgDir = "C:\vcpkg"
if (-not (Test-Path $vcpkgDir)) {
    info "Клонирую vcpkg..."
    git clone https://github.com/microsoft/vcpkg.git $vcpkgDir
}
if (-not (Test-Path "$vcpkgDir\vcpkg.exe")) {
    info "Собираю vcpkg..."
    & "$vcpkgDir\bootstrap-vcpkg.bat" -disableMetrics
}

$opensslLib = "$vcpkgDir\installed\x64-windows-static\lib\libssl.lib"
if (-not (Test-Path $opensslLib)) {
    info "Устанавливаю OpenSSL (займет ~5 минут)..."
    $ErrorActionPreference = "Continue"
    & "$vcpkgDir\vcpkg.exe" install openssl:x64-windows-static
    $ErrorActionPreference = "Stop"
}

$opensslDir = "$vcpkgDir\installed\x64-windows-static"
$env:OPENSSL_DIR    = $opensslDir
$env:OPENSSL_STATIC = "1"
success "OpenSSL: $opensslDir"

# 6. Сборка
Write-Host ""
info "Собираю equium-miner (первый раз ~5-10 минут)..."

$env:RUSTFLAGS = "-C target-cpu=native"
Set-Location $REPO_DIR
cargo build -p equium-cli-miner --release

$binary = "$REPO_DIR\target\release\equium-miner.exe"
if (-not (Test-Path $binary)) {
    die "Сборка не удалась. Бинарник не найден: $binary"
}
$size = (Get-Item $binary).Length / 1MB
success ("Сборка завершена ({0:F1} MB)" -f $size)

# 7. Установить бинарник
Write-Host ""
info "Устанавливаю в C:\equium\..."
$installDir = "C:\equium"
New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Copy-Item $binary "$installDir\equium-miner.exe" -Force
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
if ($machinePath -notlike "*C:\equium*") {
    [System.Environment]::SetEnvironmentVariable("Path", "$machinePath;$installDir", "Machine")
    $env:Path = "$env:Path;$installDir"
}
success "Бинарник установлен"

# 8. Создать кошелек
Write-Host ""
info "Проверяю кошелек..."
$walletPath = "C:\equium\wallet.json"
if (-not (Test-Path $walletPath)) {
    info "Устанавливаю Solana CLI..."
    $solanaExe = "$env:TEMP\solana-install.exe"
    Invoke-WebRequest -Uri "https://release.anza.xyz/stable/solana-install-init-x86_64-pc-windows-msvc.exe" -OutFile $solanaExe
    & $solanaExe stable
    $env:Path = "$env:USERPROFILE\.local\share\solana\install\active_release\bin;" + $env:Path
    [System.Environment]::SetEnvironmentVariable("Path", "$env:USERPROFILE\.local\share\solana\install\active_release\bin;" + [System.Environment]::GetEnvironmentVariable("Path","User"), "User")

    if (Get-Command solana-keygen -ErrorAction SilentlyContinue) {
        info "Создаю новый кошелек..."
        solana-keygen new --no-bip39-passphrase -o $walletPath
        success "Кошелек создан: $walletPath"
    } else {
        $solanaKeygen = "$env:USERPROFILE\.local\share\solana\install\active_release\bin\solana-keygen.exe"
        if (Test-Path $solanaKeygen) {
            & $solanaKeygen new --no-bip39-passphrase -o $walletPath
            success "Кошелек создан: $walletPath"
        } else {
            warn "Создай кошелек вручную после установки:"
            warn "solana-keygen new --no-bip39-passphrase -o C:\equium\wallet.json"
        }
    }
} else {
    success "Кошелек уже есть: $walletPath"
}

# 9. Спросить RPC ключ
Write-Host ""
Write-Host "   ------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Получи бесплатный RPC ключ на https://helius.dev" -ForegroundColor Yellow
Write-Host "   (публичный эндпоинт работает медленно и режет запросы)" -ForegroundColor DarkGray
Write-Host ""
$rpcUrl = Read-Host "   Вставь RPC URL от Helius (или Enter для публичного)"
if ([string]::IsNullOrWhiteSpace($rpcUrl)) {
    $rpcUrl = "https://api.mainnet-beta.solana.com"
    warn "Используется публичный RPC - могут быть задержки"
}

# 10. Спросить количество потоков
Write-Host ""
$cpuCount = $env:NUMBER_OF_PROCESSORS
info "Доступно CPU: $cpuCount"
$threadsInput = Read-Host "   Сколько потоков использовать? (Enter = все $cpuCount)"
if ([string]::IsNullOrWhiteSpace($threadsInput)) {
    $threads = 0
} else {
    $threads = [int]$threadsInput
}

# 11. Создать bat-скрипт запуска
Write-Host ""
info "Создаю скрипт запуска..."

$batLines = @(
    "@echo off",
    "set RPC_URL=$rpcUrl",
    "set KEYPAIR=C:\equium\wallet.json",
    "set THREADS=$threads",
    "",
    "C:\equium\equium-miner.exe --rpc-url %RPC_URL% --keypair %KEYPAIR% --threads %THREADS% --max-nonces-per-round 50",
    "pause"
)
$batLines | Out-File -FilePath "C:\equium\start-miner.bat" -Encoding ASCII
success "Скрипт создан: C:\equium\start-miner.bat"

# 12. Автозапуск через Task Scheduler
Write-Host ""
info "Настраиваю автозапуск..."

$taskName = "EquiumMiner"
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
$action    = New-ScheduledTaskAction -Execute "C:\equium\start-miner.bat"
$trigger   = New-ScheduledTaskTrigger -AtStartup
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Equium EQM CPU miner" | Out-Null
success "Автозапуск настроен"

# Готово
Write-Host ""
Write-Host "   ------------------------------------" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Установка завершена!" -ForegroundColor Green
Write-Host ""

if (Test-Path $walletPath) {
    Write-Host "   Адрес кошелька:" -ForegroundColor White
    $solanaKeygen = "$env:USERPROFILE\.local\share\solana\install\active_release\bin\solana-keygen.exe"
    if (Test-Path $solanaKeygen) {
        $pubkey = & $solanaKeygen pubkey $walletPath 2>$null
        Write-Host "   $pubkey" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "   Пополни кошелек SOL (~0.1 SOL) для оплаты комиссий" -ForegroundColor White
    }
}

Write-Host ""
Write-Host "   Запустить майнер:" -ForegroundColor White
Write-Host "   C:\equium\start-miner.bat" -ForegroundColor Cyan
Write-Host ""
Write-Host "   Через ~10 секунд после запуска появятся строчки:" -ForegroundColor DarkGray
Write-Host "   try #1  exhausted  165ms  44.0 H/s" -ForegroundColor DarkGray
Write-Host "   Это нормально - майнер ищет блок" -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Автозапуск при перезагрузке настроен автоматически." -ForegroundColor DarkGray
Write-Host ""
Write-Host "   ------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# Запустить сразу?
$startNow = Read-Host "   Запустить майнер прямо сейчас? (y/n)"
if ($startNow -eq "y" -or $startNow -eq "Y") {
    Start-Process "C:\equium\start-miner.bat"
}
