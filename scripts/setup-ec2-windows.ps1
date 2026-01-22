# Adsterra Bot - Windows EC2 Setup Script
# This script sets up everything needed to run the Adsterra bot on Windows EC2

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adsterra Bot - Windows EC2 Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator" -ForegroundColor Yellow
    Write-Host "Some steps may require admin rights. Continuing anyway..." -ForegroundColor Yellow
    Write-Host ""
}

# Step 1: Check and Install Node.js
Write-Host "[1/7] Checking Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "   Node.js is installed: $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "   Node.js not found. Installing..." -ForegroundColor Red
    Write-Host "   Downloading Node.js installer..." -ForegroundColor Yellow
    
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $nodeInstaller = "$env:TEMP\nodejs-installer.msi"
    
    try {
        Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
        Write-Host "   Installing Node.js (this may take a few minutes)..." -ForegroundColor Yellow
        Start-Process msiexec.exe -ArgumentList "/i `"$nodeInstaller`" /quiet /norestart" -Wait
        Remove-Item $nodeInstaller -Force
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        # Verify installation
        Start-Sleep -Seconds 3
        $nodeVersion = node --version 2>$null
        if ($nodeVersion) {
            Write-Host "   Node.js installed successfully: $nodeVersion" -ForegroundColor Green
        } else {
            Write-Host "   Node.js installation failed. Please install manually from https://nodejs.org/" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "   Failed to download/install Node.js: $_" -ForegroundColor Red
        Write-Host "   Please install Node.js manually from https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host ""

# Step 2: Check and Install Git
Write-Host "[2/7] Checking Git..." -ForegroundColor Yellow
$gitVersion = git --version 2>$null
if ($gitVersion) {
    Write-Host "   Git is installed: $gitVersion" -ForegroundColor Green
} else {
    Write-Host "   Git not found. Installing..." -ForegroundColor Red
    Write-Host "   Downloading Git installer..." -ForegroundColor Yellow
    
    $gitUrl = "https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/Git-2.43.0-64-bit.exe"
    $gitInstaller = "$env:TEMP\git-installer.exe"
    
    try {
        Invoke-WebRequest -Uri $gitUrl -OutFile $gitInstaller -UseBasicParsing
        Write-Host "   Installing Git (this may take a few minutes)..." -ForegroundColor Yellow
        Start-Process $gitInstaller -ArgumentList "/VERYSILENT /NORESTART" -Wait
        Remove-Item $gitInstaller -Force
        
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        
        # Verify installation
        Start-Sleep -Seconds 3
        $gitVersion = git --version 2>$null
        if ($gitVersion) {
            Write-Host "   Git installed successfully: $gitVersion" -ForegroundColor Green
        } else {
            Write-Host "   Git installation failed. Please install manually from https://git-scm.com/" -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "   Failed to download/install Git: $_" -ForegroundColor Red
        Write-Host "   Please install Git manually from https://git-scm.com/" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host ""

# Step 3: Clone Repository
Write-Host "[3/7] Setting up repository..." -ForegroundColor Yellow
$repoPath = "C:\AdsenseLoading"
$repoUrl = Read-Host "   Enter your GitHub repository URL (or press Enter to skip and clone manually later)"

if ($repoUrl) {
    if (Test-Path $repoPath) {
        Write-Host "   Directory already exists. Updating..." -ForegroundColor Yellow
        Set-Location $repoPath
        git pull
    } else {
        Write-Host "   Cloning repository..." -ForegroundColor Yellow
        git clone $repoUrl $repoPath
        if (-not (Test-Path $repoPath)) {
            Write-Host "   Failed to clone repository" -ForegroundColor Red
            exit 1
        }
        Set-Location $repoPath
    }
    Write-Host "   Repository ready at: $repoPath" -ForegroundColor Green
} else {
    Write-Host "   Skipped. You will need to clone the repository manually." -ForegroundColor Yellow
    Write-Host "   Run: git clone <your-repo-url> C:\AdsenseLoading" -ForegroundColor Yellow
    if (-not (Test-Path $repoPath)) {
        New-Item -ItemType Directory -Path $repoPath -Force | Out-Null
    }
    Set-Location $repoPath
}
Write-Host ""

# Step 4: Install Dependencies
Write-Host "[4/7] Installing dependencies..." -ForegroundColor Yellow
Set-Location "$repoPath"
Write-Host "   Installing dependencies..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "   Installing Playwright browsers (this may take 5-10 minutes)..." -ForegroundColor Yellow
npx playwright install chromium firefox webkit
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Playwright browser installation had issues, but continuing..." -ForegroundColor Yellow
}
Write-Host "   Dependencies installed" -ForegroundColor Green
Write-Host ""

# Step 5: Install PM2
Write-Host "[5/7] Installing PM2 (process manager)..." -ForegroundColor Yellow
npm install -g pm2
npm install -g pm2-windows-startup
if ($LASTEXITCODE -ne 0) {
    Write-Host "   PM2 installation had issues, but continuing..." -ForegroundColor Yellow
} else {
    Write-Host "   PM2 installed" -ForegroundColor Green
}
Write-Host ""

# Step 6: Create .env file
Write-Host "[6/7] Setting up environment variables..." -ForegroundColor Yellow
$envFile = "$repoPath\.env"
$envTemplate = @"
# Proxy Provider Selection: iproyal, dataimpulse, or brightdata
PROXY_PROVIDER=brightdata

# BrightData Mobile Proxy Configuration
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_USERNAME=brd-customer-hl_d4382b99-zone-mb
BRIGHTDATA_PASSWORD=YOUR_PASSWORD_HERE
BRIGHTDATA_ZONE=mb

# AWS Configuration
AWS_REGION=us-east-1
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# Browser Configuration
BROWSER_HEADLESS=false
BROWSER_TIMEOUT=30000

# Queue Configuration
QUEUE_POLL_INTERVAL=1000
MAX_RETRIES=3

# Timing Configuration
MIN_SCROLL_WAIT=0
MAX_SCROLL_WAIT=0
MIN_AD_WAIT=20000
MAX_AD_WAIT=60000

# Worker Configuration
PROCESS_IMMEDIATELY=true
CONCURRENT_JOBS=50
MAX_CONCURRENT_JOBS=500
"@

if (Test-Path $envFile) {
    Write-Host "   .env file already exists. Backing up to .env.backup" -ForegroundColor Yellow
    Copy-Item $envFile "$envFile.backup" -Force
}

Set-Content -Path $envFile -Value $envTemplate
Write-Host "   .env file created at: $envFile" -ForegroundColor Green
Write-Host "   IMPORTANT: Edit .env file and add your credentials!" -ForegroundColor Yellow
Write-Host "      - BrightData password" -ForegroundColor Yellow
Write-Host "      - AWS credentials (if not using IAM role)" -ForegroundColor Yellow
Write-Host ""

# Step 7: Create PM2 ecosystem file
Write-Host "[7/7] Creating PM2 configuration..." -ForegroundColor Yellow
$ecosystemFile = "$repoPath\ecosystem.config.js"
$ecosystemConfig = @"
module.exports = {
  apps: [{
    name: 'adsterra-worker',
    script: 'src/worker.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '4G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
"@

Set-Content -Path $ecosystemFile -Value $ecosystemConfig
Write-Host "   PM2 configuration created" -ForegroundColor Green
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Edit .env file and add your credentials:" -ForegroundColor White
Write-Host "   notepad $envFile" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Start the worker:" -ForegroundColor White
Write-Host "   cd $repoPath" -ForegroundColor Gray
Write-Host "   pm2 start ecosystem.config.js" -ForegroundColor Gray
Write-Host "   pm2 save" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check status:" -ForegroundColor White
Write-Host "   pm2 status" -ForegroundColor Gray
Write-Host "   pm2 logs adsterra-worker" -ForegroundColor Gray
Write-Host ""
Write-Host "4. To update code later:" -ForegroundColor White
Write-Host "   cd $repoPath" -ForegroundColor Gray
Write-Host "   git pull" -ForegroundColor Gray
Write-Host "   npm install  # if dependencies changed" -ForegroundColor Gray
Write-Host "   pm2 restart adsterra-worker" -ForegroundColor Gray
Write-Host ""
