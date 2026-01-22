# Fix PM2 ecosystem.config.js to use correct paths
$repoPath = "C:\AdsenseLoading"
$ecosystemFile = "$repoPath\ecosystem.config.js"

Write-Host "Fixing PM2 configuration..." -ForegroundColor Yellow

$ecosystemConfig = @"
module.exports = {
  apps: [{
    name: 'adsterra-worker',
    script: 'src/worker.ts',
    cwd: '$repoPath\adsterra',
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
Write-Host "✅ PM2 configuration updated!" -ForegroundColor Green
Write-Host ""
Write-Host "Now restart PM2:" -ForegroundColor Yellow
Write-Host "  pm2 delete adsterra-worker" -ForegroundColor Gray
Write-Host "  pm2 start ecosystem.config.js" -ForegroundColor Gray
Write-Host "  pm2 save" -ForegroundColor Gray

