/**
 * Anti-Fraud Test with MOBILE SIMULATION + PROXY
 * Realistic test: How will bot look to Adsterra with anti-detection?
 * 
 * Run: npx tsx scripts/test-antifraud-mobile-proxy.ts
 */

import { chromium, Page } from 'playwright';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';
import { getRandomDevice, getContextOptionsForDevice } from '../src/config/devices';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function testCreepJSScore(testName: string, useAntiDetection: boolean, useProxy: boolean = false) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 TEST: ${testName}`);
  console.log(`   Anti-Detection: ${useAntiDetection ? '✅ YES' : '❌ NO'}`);
  console.log(`   Mobile Simulation: ✅ YES`);
  console.log(`   Proxy: ${useProxy ? '✅ YES' : '❌ NO'}`);
  console.log(`${'='.repeat(80)}\n`);

  let browser = null;
  let page: Page | null = null;

  try {
    const device = getRandomDevice();
    console.log(`📱 Device: ${device.deviceName}`);
    console.log(`🔑 Bot ID: test-${useAntiDetection ? 'protected' : 'exposed'}-${Date.now()}\n`);

    // Launch browser with anti-automation flags
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=WebRTC,AutomationControlled',
      '--disable-webrtc',
    ];

    console.log(`🚀 Launching Chromium...`);
    browser = await chromium.launch({
      headless: true, // Use headless since we're just testing
      args: launchArgs,
    });

    // Get device-specific context options
    const contextOptions = getContextOptionsForDevice(device.config, 'US');
    
    // Add proxy if enabled
    if (useProxy) {
      // In real scenario, would use actual proxy
      // For test, simulate proxy but use direct connection
      console.log(`🔗 Proxy: Simulated (would use BrightData in production)`);
    }

    console.log(`🖥️  Creating mobile context...`);
    const context = await browser.newContext({
      ...contextOptions,
      ignoreHTTPSErrors: true,
      // In production: proxy: { server: proxyServer, username, password }
    });

    page = await context.newPage();

    // Apply anti-detection if enabled
    if (useAntiDetection) {
      console.log(`✅ Applying 4-layer anti-detection...\n`);
      await setupBrowserAntiDetection(page, device.config, device.deviceName);
    } else {
      console.log(`⚠️  NO anti-detection applied\n`);
    }

    // Navigate to CreepJS
    console.log(`🌐 Opening CreepJS (https://abrahamjuliot.github.io/creepjs/)...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Wait for CreepJS tests to complete
    console.log(`⏳ Waiting 12 seconds for CreepJS analysis...\n`);
    await sleep(12000);

    // Extract scores with multiple selector attempts
    const scores = await page.evaluate(() => {
      const result: any = {
        lieScore: null,
        trustScore: null,
        confidence: null,
        rawContent: '',
      };

      // Try to find lie score
      let lieElement = document.querySelector('.lies');
      if (!lieElement) {
        lieElement = document.querySelector('[class*="lie"]');
      }
      if (lieElement) {
        result.lieScore = lieElement.textContent?.trim();
      }

      // Try to find trust score
      let trustElement = document.querySelector('.trust-score');
      if (!trustElement) {
        trustElement = document.querySelector('[class*="trust"]');
      }
      if (trustElement) {
        result.trustScore = trustElement.textContent?.trim();
      }

      // Try confidence score
      let confElement = document.querySelector('[class*="confidence"]');
      if (!confElement) {
        confElement = document.querySelector('[class*="correct"]');
      }
      if (confElement) {
        result.confidence = confElement.textContent?.trim();
      }

      // Get all text with percentage signs (likely to contain scores)
      const allElements = document.querySelectorAll('*');
      const textWithPercent: string[] = [];
      
      allElements.forEach((el) => {
        const text = el.textContent || '';
        if (text.includes('%') && text.length < 100) {
          const percentage = text.match(/(\d+)\s*%/);
          if (percentage && !textWithPercent.includes(text)) {
            textWithPercent.push(text.trim());
          }
        }
      });

      result.allScores = textWithPercent.slice(0, 10);

      return result;
    });

    // Display results
    console.log(`${'─'.repeat(80)}`);
    console.log(`📊 CREEPJS RESULTS:`);
    console.log(`${'─'.repeat(80)}`);

    if (scores.lieScore) {
      console.log(`🚨 Lie Score (Fraud Detection): ${scores.lieScore}`);
    } else {
      console.log(`🚨 Lie Score: NOT FOUND (checking all percentages...)`);
    }

    if (scores.trustScore) {
      console.log(`✅ Trust Score: ${scores.trustScore}`);
    }

    if (scores.allScores && scores.allScores.length > 0) {
      console.log(`\n📋 All Detected Scores:`);
      scores.allScores.forEach((score: any, i: number) => {
        console.log(`   ${i + 1}. ${score}`);
      });
    }

    console.log(`\n${'─'.repeat(80)}`);

    // Evaluate if passing
    const lieMatch = scores.lieScore?.match(/(\d+)/);
    if (lieMatch) {
      const liePercent = parseInt(lieMatch[1]);
      const isPassing = liePercent < 20;
      console.log(`\n🎯 VERDICT: ${isPassing ? '✅ PASS' : '❌ FAIL'} (Lie: ${liePercent}%)`);
      console.log(`   Target: < 20% | Result: ${liePercent}%`);
      if (isPassing) {
        console.log(`   ✅ Bot will likely PASS Adsterra anti-fraud checks`);
      } else {
        console.log(`   ⚠️  Bot may be FLAGGED as suspicious`);
      }
    }

    await context.close();
    return scores;

  } catch (error) {
    console.error(`\n❌ ERROR: ${error}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  console.log(`\n`);
  console.log(`${'╔'.padEnd(80, '═')}╗`);
  console.log(`║ 🛡️  ANTI-FRAUD TEST WITH MOBILE + PROXY`.padEnd(79) + `║`);
  console.log(`║ How will your bot perform in Adsterra anti-fraud system?`.padEnd(79) + `║`);
  console.log(`${'╚'.padEnd(80, '═')}╝`);

  // Test 1: WITHOUT anti-detection
  console.log(`\n📍 PHASE 1: Testing WITHOUT anti-detection (baseline)...`);
  const resultsWithout = await testCreepJSScore(
    'BASELINE - No Anti-Detection',
    false,
    false
  );

  // Small delay between tests
  await sleep(3000);

  // Test 2: WITH anti-detection
  console.log(`\n📍 PHASE 2: Testing WITH anti-detection (protected)...`);
  const resultsWith = await testCreepJSScore(
    'PROTECTED - With 4-Layer Anti-Detection',
    true,
    false
  );

  // Test 3: WITH anti-detection + PROXY
  console.log(`\n📍 PHASE 3: Testing WITH anti-detection + simulated proxy...`);
  const resultsWithProxy = await testCreepJSScore(
    'PROXY+PROTECTED - Anti-Detection + Proxy Simulation',
    true,
    true
  );

  // Summary comparison
  console.log(`\n\n`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`📊 FINAL COMPARISON - ALL TESTS`);
  console.log(`${'═'.repeat(80)}\n`);

  console.log(`Test Configuration:`);
  console.log(`  1. Baseline (no protection): ${resultsWithout?.lieScore || 'N/A'}`);
  console.log(`  2. With anti-detection: ${resultsWith?.lieScore || 'N/A'}`);
  console.log(`  3. With anti-detection + proxy: ${resultsWithProxy?.lieScore || 'N/A'}`);

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`✅ ANALYSIS:`);
  console.log(`${'─'.repeat(80)}\n`);

  const baseline = resultsWithout?.lieScore?.match(/(\d+)/)?.[1];
  const protected_ = resultsWith?.lieScore?.match(/(\d+)/)?.[1];

  if (baseline && protected_) {
    const baselineNum = parseInt(baseline);
    const protectedNum = parseInt(protected_);
    const improvement = baselineNum - protectedNum;
    const improvementPercent = Math.round((improvement / baselineNum) * 100);

    console.log(`📈 Improvement: ${improvement}% reduction (${improvementPercent}% better)`);
    console.log(`   Before: ${baselineNum}% → After: ${protectedNum}%`);

    if (protectedNum < 20) {
      console.log(`\n   ✅ READY FOR PRODUCTION`);
      console.log(`      Your bot will likely pass Adsterra anti-fraud tests`);
    } else if (protectedNum < 40) {
      console.log(`\n   ⚠️  MARGINAL - Needs more optimization`);
      console.log(`      Bot may be flagged in ~30% of cases`);
    } else {
      console.log(`\n   ❌ NOT READY - Anti-detection not effective`);
      console.log(`      Need to implement additional layers`);
    }
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`✅ Test Complete!\n`);
}

main().catch(console.error);
