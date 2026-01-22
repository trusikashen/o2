/**
 * Simple CreepJS fraud score test
 * Shows what CreepJS reports for a bot WITH anti-detection applied
 */

import { chromium, Page } from 'playwright';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';
import { getRandomDevice } from '../src/config/devices';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🛡️  CREEPJS ANTI-DETECTION VERIFICATION`);
  console.log(`${'='.repeat(80)}\n`);
  
  let browser = null;
  let page: Page | null = null;
  
  try {
    const device = getRandomDevice();
    console.log(`📱 Device: ${device.deviceName}\n`);
    
    // Launch browser with anti-detection flags
    console.log(`🚀 Launching Chromium with anti-detection flags...`);
    browser = await chromium.launch({
      headless: false,
      args: [
        '--disable-blink-features=WebRTC,AutomationControlled',
        '--disable-webrtc',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });
    
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Apply anti-detection setup
    console.log(`✅ Applying anti-detection setup...`);
    await setupBrowserAntiDetection(page, device.config, device.deviceName);
    
    // Navigate to CreepJS
    console.log(`🌐 Opening CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      waitUntil: 'domcontentloaded',
    });
    
    // Wait for tests to complete
    console.log(`⏳ Waiting for CreepJS tests (15 seconds)...`);
    await sleep(15000);
    
    // Extract results
    const results = await page.evaluate(() => {
      const data: any = {
        lieScore: 'N/A',
        trustScore: 'N/A',
        confidence: 'N/A',
        fingerprint: 'N/A',
      };
      
      // Try multiple selectors for lie score
      const lieElements = Array.from(document.querySelectorAll('*')).filter(el => 
        (el.textContent || '').includes('lie') || (el.textContent || '').includes('Lie')
      );
      
      lieElements.forEach(el => {
        const text = el.textContent || '';
        if (text.includes('%')) {
          const match = text.match(/(\d+)%/);
          if (match) {
            data.lieScore = match[1] + '%';
          }
        }
      });
      
      // Get all visible text with scores
      const allText = document.body.innerText;
      const lines = allText.split('\n').filter(line => line.includes('%') || line.includes('score'));
      
      return {
        ...data,
        visibleInfo: lines.slice(0, 20).join('\n'),
      };
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 CREEPJS RESULTS (WITH ANTI-DETECTION):`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Lie Score: ${results.lieScore}`);
    console.log(`Trust Score: ${results.trustScore}`);
    console.log(`Confidence: ${results.confidence}\n`);
    console.log(`Visible Information:\n${results.visibleInfo}`);
    
    // Keep browser open for manual inspection
    console.log(`\n✅ Browser is open. You can manually check the results on CreepJS.`);
    console.log(`   Close the browser to exit...`);
    
    // Wait for browser to close
    await context.close();
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch(console.error);
