/**
 * Ensure Playwright browsers are installed before starting worker
 * This is needed because DigitalOcean App Platform build and runtime
 * environments may have separate filesystems
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

const PLAYWRIGHT_CACHE_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH || 
  join(process.env.HOME || process.cwd(), '.cache', 'ms-playwright');

console.log('🔍 Checking Playwright browser installation...');
console.log(`   Cache directory: ${PLAYWRIGHT_CACHE_DIR}`);

// Check if Chromium is installed
const chromiumPath = join(
  PLAYWRIGHT_CACHE_DIR,
  'chromium_headless_shell-1200',
  'chrome-headless-shell-linux64',
  'chrome-headless-shell'
);

if (!existsSync(chromiumPath)) {
  console.log('📦 Chromium not found, installing...');
  try {
    execSync('npx playwright install chromium', {
      stdio: 'inherit',
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: PLAYWRIGHT_CACHE_DIR,
      },
    });
    console.log('✅ Chromium installed successfully');
  } catch (error: any) {
    console.error('❌ Failed to install Chromium:', error.message);
    console.log('⚠️  Continuing anyway - will try to install at runtime...');
  }
} else {
  console.log('✅ Chromium already installed');
}

