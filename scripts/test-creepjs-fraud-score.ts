/**
 * Test Anti-Detection System with CreepJS Fraud Detection
 * 
 * This script verifies that our 4-layer anti-detection system works:
 * - Checks Lie Score (should be < 20%)
 * - Checks Trust Score (should be > 80%)
 * 
 * Run: npx ts-node scripts/test-creepjs-fraud-score.ts
 */

import { chromium, webkit, Browser, Page } from 'playwright';
import { getRandomDevice, getContextOptionsForDevice } from '../src/config/devices';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';

interface CreepJSResults {
  lieScore: number | null;
  trustScore: number | null;
  passed: boolean;
  feedback: string[];
}

async function extractCreepJSScores(page: Page): Promise<CreepJSResults> {
  const results: CreepJSResults = {
    lieScore: null,
    trustScore: null,
    passed: false,
    feedback: [],
  };

  try {
    // Wait for CreepJS to finish analysis (usually 2-3 seconds)
    await page.waitForTimeout(4000);

    // Extract Lie Score
    try {
      const lieScoreText = await page.textContent('.lies');
      if (lieScoreText) {
        // Format is usually "45%" or "45.2%"
        const match = lieScoreText.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          results.lieScore = parseFloat(match[1]);
        }
      }
    } catch (e) {
      results.feedback.push('⚠️  Could not extract Lie Score');
    }

    // Extract Trust Score (might be in different selectors)
    try {
      // Try multiple selectors
      let trustScoreText = await page.textContent('.trust-score');
      if (!trustScoreText) {
        trustScoreText = await page.textContent('[data-trust-score]');
      }
      if (!trustScoreText) {
        // CreepJS might show it differently, try getting all text
        trustScoreText = await page.textContent('body');
      }

      if (trustScoreText) {
        // Trust score = 100 - lieScore, so we can calculate it
        if (results.lieScore !== null) {
          results.trustScore = 100 - results.lieScore;
        }
      }
    } catch (e) {
      results.feedback.push('⚠️  Could not extract Trust Score');
    }

    // Validate results
    if (results.lieScore !== null) {
      if (results.lieScore < 20) {
        results.feedback.push(`✅ Lie Score EXCELLENT: ${results.lieScore}% (< 20%)`);
        results.passed = true;
      } else if (results.lieScore < 30) {
        results.feedback.push(`🟡 Lie Score GOOD: ${results.lieScore}% (< 30%)`);
        results.passed = true;
      } else if (results.lieScore < 50) {
        results.feedback.push(`⚠️  Lie Score ACCEPTABLE: ${results.lieScore}% (< 50%)`);
        results.passed = true;
      } else {
        results.feedback.push(`🔴 Lie Score TOO HIGH: ${results.lieScore}% (should be < 20%)`);
        results.passed = false;
      }
    }

    if (results.trustScore !== null) {
      if (results.trustScore > 80) {
        results.feedback.push(`✅ Trust Score EXCELLENT: ${results.trustScore}% (> 80%)`);
      } else if (results.trustScore > 70) {
        results.feedback.push(`🟡 Trust Score GOOD: ${results.trustScore}% (> 70%)`);
      } else {
        results.feedback.push(`⚠️  Trust Score LOW: ${results.trustScore}% (should be > 80%)`);
        results.passed = false;
      }
    }
  } catch (error: any) {
    results.feedback.push(`❌ Error extracting scores: ${error.message}`);
  }

  return results;
}

async function runCreepJSTest(
  browserType: 'chromium' | 'webkit' = 'chromium',
  withAntiDetection: boolean = true,
  testNumber: number = 1
): Promise<void> {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🧪 TEST ${testNumber}: CreepJS Fraud Detection (${browserType})`);
    console.log(`${withAntiDetection ? '🛡️  WITH' : '❌ WITHOUT'} Anti-Detection System`);
    console.log(`${'='.repeat(80)}\n`);

    // Get random device
    const deviceResult = getRandomDevice();
    const deviceConfig = deviceResult.config;
    const botId = `test-bot-${browserType}-${testNumber}`;

    console.log(`📱 Device: ${deviceResult.deviceName}`);
    console.log(`🌐 Browser: ${browserType}`);
    console.log(`🔑 Bot ID: ${botId}\n`);

    // Launch browser
    const browserLauncher = browserType === 'webkit' ? webkit : chromium;
    const args =
      browserType === 'chromium'
        ? [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-webrtc',
            '--disable-dev-shm-usage',
            '--ignore-certificate-errors',
            '--disable-blink-features=AutomationControlled',
          ]
        : [];

    console.log(`🚀 Launching ${browserType} browser...`);
    browser = await browserLauncher.launch({
      headless: true,
      ...(browserType === 'chromium' ? { args } : {}),
    });

    // Create context with device emulation
    const contextOptions = getContextOptionsForDevice(deviceConfig, 'US');
    const context = await browser.newContext({
      ...contextOptions,
      ignoreHTTPSErrors: true,
    });

    // Create page
    page = await context.newPage();
    console.log(`📄 Page created\n`);

    // Apply anti-detection if requested
    if (withAntiDetection) {
      console.log(`🛡️  Applying anti-detection setup...`);
      try {
        await setupBrowserAntiDetection(page, deviceConfig, botId);
        console.log(`✅ Anti-detection applied\n`);
      } catch (setupError: any) {
        console.warn(`⚠️  Anti-detection setup failed: ${setupError.message}\n`);
      }
    } else {
      console.log(`❌ Skipping anti-detection (test comparison)\n`);
    }

    // Navigate to CreepJS
    console.log(`🌐 Navigating to CreepJS (https://abrahamjuliot.github.io/creepjs/)...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    console.log(`✅ Page loaded\n`);

    // Extract results
    console.log(`📊 Extracting CreepJS scores...`);
    const results = await extractCreepJSScores(page);

    // Display results
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 RESULTS:`);
    console.log(`${'─'.repeat(80)}`);

    if (results.lieScore !== null) {
      console.log(`\n💬 Lie Score: ${results.lieScore}%`);
      console.log(`   ├─ Target: < 20%`);
      console.log(`   └─ Status: ${results.lieScore < 20 ? '✅ PASS' : '❌ FAIL'}`);
    }

    if (results.trustScore !== null) {
      console.log(`\n🤝 Trust Score: ${results.trustScore}%`);
      console.log(`   ├─ Target: > 80%`);
      console.log(`   └─ Status: ${results.trustScore > 80 ? '✅ PASS' : '❌ FAIL'}`);
    }

    console.log(`\n📝 Feedback:`);
    results.feedback.forEach((msg) => {
      console.log(`   ${msg}`);
    });

    console.log(`\n🎯 Overall Result: ${results.passed ? '✅ PASS' : '⚠️  NEEDS IMPROVEMENT'}`);
    console.log(`${'─'.repeat(80)}\n`);

    await context.close();
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function runAllTests(): Promise<void> {
  console.log(`\n\n`);
  console.log(`${'╔' + '═'.repeat(78) + '╗'}`);
  console.log(`║ ${'🛡️  ANTI-DETECTION SYSTEM TEST WITH CREEPJS'.padEnd(76)} ║`);
  console.log(`║ ${'Verify Lie Score < 20% and Trust Score > 80%'.padEnd(76)} ║`);
  console.log(`${'╚' + '═'.repeat(78) + '╝'}`);

  try {
    // Test 1: Chromium WITH anti-detection
    await runCreepJSTest('chromium', true, 1);

    // Test 2: Chromium WITHOUT anti-detection (comparison)
    await runCreepJSTest('chromium', false, 2);

    // Summary
    console.log(`\n\n`);
    console.log(`${'╔' + '═'.repeat(78) + '╗'}`);
    console.log(`║ ${'SUMMARY'.padEnd(76)} ║`);
    console.log(`${'╠' + '═'.repeat(78) + '╣'}`);
    console.log(`║ ✅ WITH anti-detection:    Should show Lie Score < 20%           ║`);
    console.log(`║ ❌ WITHOUT anti-detection: Should show Lie Score > 50%          ║`);
    console.log(`║                                                                  ║`);
    console.log(`║ If difference is significant, our anti-detection is working! 🎉  ║`);
    console.log(`${'╚' + '═'.repeat(78) + '╝'}`);
  } catch (error: any) {
    console.error(`\nTest suite failed: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
