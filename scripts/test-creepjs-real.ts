/**
 * Test anti-detection system with REAL CreepJS website
 * This is the true test: what does CreepJS actually report?
 * 
 * Run: npx tsx scripts/test-creepjs-real.ts
 */

import { chromium, Page } from 'playwright';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';
import { getRandomDevice } from '../src/config/devices';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runCreepJSTest(name: string, useAntiDetection: boolean) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing CreepJS with anti-detection: ${useAntiDetection ? '✅ YES' : '❌ NO'}`);
  console.log(`${'='.repeat(80)}\n`);
  
  let browser = null;
  let page: Page | null = null;
  
  try {
    // Launch Chromium
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=WebRTC,AutomationControlled',
        '--disable-webrtc',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });
    
    page = await context.newPage();
    
    if (useAntiDetection) {
      const device = getRandomDevice();
    console.log(`📱 Using device: ${device.deviceName}`);
    await setupBrowserAntiDetection(page, device.config, device.deviceName);
    }
    
    console.log(`🌐 Navigating to CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    
    console.log(`⏳ Waiting for CreepJS to load and test...`);
    await sleep(5000); // Wait for tests to run
    
    // Extract the lie score
    const lieScore = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*')).filter(el => 
        (el.textContent || '').includes('lie') || (el.textContent || '').includes('Lie')
      );
      
      for (const el of elements) {
        const text = el.textContent || '';
        if (text.includes('%')) {
          const match = text.match(/\d+%/);
          if (match) return match[0];
        }
      }
      return 'N/A';
    });
    
    console.log(`📊 CreepJS Lie Score: ${lieScore}`);
    
    // Get summary info
    const summary = await page.evaluate(() => {
      const rows: any = {};
      const elements = document.querySelectorAll('div[class*="row"]');
      elements.forEach((el) => {
        const text = el.textContent || '';
        if (text.length > 10 && text.length < 200) {
          rows[text.substring(0, 50)] = text;
        }
      });
      return rows;
    });
    
    console.log(`\n📋 CreepJS Summary:`);
    Object.entries(summary).slice(0, 10).forEach(([key, value]) => {
      console.log(`  • ${value}`);
    });
    
    // Keep browser open for manual inspection
    console.log(`\n✅ Test complete! Browser is open for manual inspection.`);
    console.log(`   Close the browser window to continue...`);
    
    await page.waitForEvent('close');
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🛡️  CREEPJS ANTI-DETECTION TEST`);
  console.log(`${'='.repeat(80)}`);
  
  // Test WITHOUT anti-detection first
  console.log(`\n1️⃣  Testing WITHOUT anti-detection...`);
  await runCreepJSTest('without-antidetection', false);
  
  // Test WITH anti-detection
  console.log(`\n2️⃣  Testing WITH anti-detection...`);
  await runCreepJSTest('with-antidetection', true);
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`✅ COMPARISON COMPLETE`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\n📊 Compare the Lie Scores above:`);
  console.log(`   WITHOUT anti-detection: Should be HIGH (50%+)`);
  console.log(`   WITH anti-detection: Should be LOW (<20%)`);
  console.log(`   Difference: Target is 40%+ improvement`);
}

main().catch(console.error);
