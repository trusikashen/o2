/**
 * Get actual fraud score from CreepJS
 * Shows: Lie Score and Trust Score
 */

import { chromium, Page } from 'playwright';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';
import { getRandomDevice } from '../src/config/devices';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getFraudScore(useAntiDetection: boolean) {
  const testName = useAntiDetection ? 'WITH Anti-Detection' : 'WITHOUT Anti-Detection';
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Testing CreepJS: ${testName}`);
  console.log(`${'='.repeat(80)}\n`);
  
  let browser = null;
  let page: Page | null = null;
  
  try {
    const device = getRandomDevice();
    
    // Launch browser
    console.log(`🚀 Launching browser...`);
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
    
    // Apply anti-detection if requested
    if (useAntiDetection) {
      console.log(`✅ Applying anti-detection setup...`);
      await setupBrowserAntiDetection(page, device.config, device.deviceName);
    } else {
      console.log(`⊘ Skipping anti-detection (baseline test)...`);
    }
    
    // Navigate to CreepJS
    console.log(`🌐 Opening CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for tests to complete
    console.log(`⏳ Waiting for CreepJS to analyze (20 seconds)...`);
    await sleep(20000);
    
    // Extract fraud scores
    console.log(`📊 Extracting scores...`);
    const scores = await page.evaluate(() => {
      const result: any = {
        lieScore: null,
        trustScore: null,
        fingerprint: null,
        allText: [],
      };
      
      // Try different selectors for lie score
      let lieElement = document.querySelector('.lies');
      if (!lieElement) {
        lieElement = document.querySelector('[class*="lie"]');
      }
      if (lieElement) {
        result.lieScore = lieElement.textContent?.trim();
      }
      
      // Try different selectors for trust score
      let trustElement = document.querySelector('.trust-score');
      if (!trustElement) {
        trustElement = document.querySelector('[class*="trust"]');
      }
      if (trustElement) {
        result.trustScore = trustElement.textContent?.trim();
      }
      
      // Get all text containing percentages
      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const text = el.textContent || '';
        if (text.includes('%') && text.length < 200 && text.length > 5) {
          const unique = !result.allText.includes(text);
          if (unique) {
            result.allText.push(text.trim());
          }
        }
      });
      
      return result;
    });
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 RESULTS: ${testName}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Lie Score: ${scores.lieScore || 'NOT FOUND'}`);
    console.log(`Trust Score: ${scores.trustScore || 'NOT FOUND'}`);
    console.log(`\nAll percentage values found:`);
    scores.allText.slice(0, 15).forEach((text: string) => {
      console.log(`  • ${text}`);
    });
    
    return {
      lieScore: scores.lieScore,
      trustScore: scores.trustScore,
      allText: scores.allText,
    };
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    return null;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
  }
}

async function main() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🛡️  ANTI-FRAUD TEST - CREEPJS FRAUD SCORE`);
  console.log(`${'='.repeat(80)}`);
  
  // Test baseline (without anti-detection)
  console.log(`\n1️⃣  Baseline test (WITHOUT anti-detection)...`);
  const baselineScores = await getFraudScore(false);
  
  // Test with anti-detection
  console.log(`\n2️⃣  Testing WITH anti-detection...`);
  const antiDetectionScores = await getFraudScore(true);
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 COMPARISON SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  console.log(`\nBASELINE (no anti-detection):`);
  console.log(`  Lie Score: ${baselineScores?.lieScore || 'N/A'}`);
  console.log(`  Trust Score: ${baselineScores?.trustScore || 'N/A'}`);
  console.log(`\nWITH ANTI-DETECTION:`);
  console.log(`  Lie Score: ${antiDetectionScores?.lieScore || 'N/A'}`);
  console.log(`  Trust Score: ${antiDetectionScores?.trustScore || 'N/A'}`);
  console.log(`\n🎯 PASS CRITERIA:`);
  console.log(`  ✓ Lie Score < 20%`);
  console.log(`  ✓ Trust Score > 80%`);
  console.log(`  ✓ Improvement: 40%+ difference between baseline and anti-detection`);
}

main().catch(console.error);
