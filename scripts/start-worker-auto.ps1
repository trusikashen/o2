# Auto-start script for Adsterra Worker
# This script keeps the worker running and auto-restarts it if it crashes
# Run this on Google Cloud VM to keep worker running

$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoPath = "C:\adsterra"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adsterra Worker Auto-Start" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

while ($true) {
    try {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Starting worker..." -ForegroundColor Yellow
        
        Set-Location $repoPath
        $process = Start-Process -FilePath "npx" -ArgumentList "tsx", "src/worker.ts" -NoNewWindow -PassThru -Wait
        
        if ($process.ExitCode -ne 0) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Worker exited with code $($process.ExitCode). Restarting in 10 seconds..." -ForegroundColor Red
            Start-Sleep -Seconds 10
        } else {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Worker stopped normally. Exiting..." -ForegroundColor Green
            break
        }
    } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Error: $_" -ForegroundColor Red
        Write-Host "Restarting in 10 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }
}

