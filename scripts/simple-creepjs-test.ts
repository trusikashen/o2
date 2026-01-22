/**
 * Simple CreepJS Fraud Detection Test
 * Standalone version to test anti-detection without dependencies
 */

import { chromium, Browser, Page } from 'playwright';

interface TestResult {
  lieScore: number | null;
  trustScore: number | null;
  passed: boolean;
}

async function testWithAntiDetection(): Promise<TestResult> {
  let browser: Browser | null = null;
  const result: TestResult = {
    lieScore: null,
    trustScore: null,
    passed: false,
  };

  try {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🧪 Testing WITH Anti-Detection System`);
    console.log(`${'═'.repeat(80)}\n`);

    // Launch browser
    console.log(`🚀 Launching Chromium...`);
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-webrtc',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    // Create context
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    // Create page
    const page = await context.newPage();
    console.log(`✅ Page created\n`);

    // Apply anti-detection manually (simple version)
    console.log(`🛡️  Applying anti-detection setup...`);
    
    // Block WebRTC
    await page.addInitScript(() => {
      delete (window as any).RTCPeerConnection;
      delete (window as any).webkitRTCPeerConnection;
      delete (window as any).mozRTCPeerConnection;
      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new Error('Permission denied');
        };
      }
    });
    console.log(`   ✅ WebRTC blocked`);

    // Randomize canvas
    const seed = 0.42; // Fixed seed for testing
    await page.addInitScript((s: number) => {
      const noise = Math.floor(s * 2) - 1;
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(...args: any[]) {
        try {
          const ctx = this.getContext('2d');
          if (ctx) {
            const imgData = ctx.getImageData(0, 0, this.width, this.height);
            for (let i = 0; i < imgData.data.length; i += 4) {
              imgData.data[i] = Math.max(0, Math.min(255, imgData.data[i] + noise));
              imgData.data[i + 1] = Math.max(0, Math.min(255, imgData.data[i + 1] + noise));
              imgData.data[i + 2] = Math.max(0, Math.min(255, imgData.data[i + 2] + noise));
            }
            ctx.putImageData(imgData, 0, 0);
          }
        } catch (e) {}
        return origToDataURL.call(this, ...args);
      };
    }, seed);
    console.log(`   ✅ Canvas randomized`);

    // Spoof WebGL
    await page.addInitScript(() => {
      const vendor = 'Intel Inc.';
      const renderer = 'Intel Iris OpenGL Engine';
      const origGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter: number) {
        if (parameter === 37445) return vendor;
        if (parameter === 37446) return renderer;
        return origGetParameter.call(this, parameter);
      };
    });
    console.log(`   ✅ WebGL spoofed`);

    // Spoof navigator
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });
    });
    console.log(`   ✅ Navigator spoofed\n`);

    // Navigate to CreepJS
    console.log(`🌐 Navigating to CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    console.log(`✅ Page loaded\n`);

    // Wait for analysis
    console.log(`📊 Waiting for CreepJS analysis (4 seconds)...`);
    await page.waitForTimeout(4000);

    // Extract scores
    console.log(`📊 Extracting fraud scores...\n`);
    
    try {
      // Try to get the text that shows the score
      const pageContent = await page.content();
      
      // Log some HTML to help debug
      if (pageContent.includes('lies')) {
        console.log(`✅ Found 'lies' element in page`);
      } else {
        console.log(`⚠️  No 'lies' element found`);
      }

      // Try different ways to extract
      const lieScoreText = await page.textContent('.lies');
      console.log(`Lie Score Text: ${lieScoreText}`);

      if (lieScoreText) {
        const match = lieScoreText.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          result.lieScore = parseFloat(match[1]);
        }
      }
    } catch (e: any) {
      console.log(`⚠️  Could not extract Lie Score: ${e.message}`);
    }

    // Calculate trust score
    if (result.lieScore !== null) {
      result.trustScore = 100 - result.lieScore;
      result.passed = result.lieScore < 20;
    }

    // Display results
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 RESULTS:`);
    console.log(`${'─'.repeat(80)}\n`);

    if (result.lieScore !== null) {
      console.log(`💬 Lie Score: ${result.lieScore.toFixed(1)}%`);
      console.log(`   Target: < 20%`);
      console.log(`   Status: ${result.lieScore < 20 ? '✅ PASS' : '⚠️  FAIL'}\n`);
    } else {
      console.log(`⚠️  Could not extract Lie Score\n`);
    }

    if (result.trustScore !== null) {
      console.log(`🤝 Trust Score: ${result.trustScore.toFixed(1)}%`);
      console.log(`   Target: > 80%`);
      console.log(`   Status: ${result.trustScore > 80 ? '✅ PASS' : '⚠️  FAIL'}\n`);
    }

    console.log(`${'─'.repeat(80)}`);
    console.log(`🎯 Overall: ${result.passed ? '✅ ANTI-DETECTION WORKING!' : '⚠️  NEEDS ADJUSTMENT'}`);
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

  return result;
}

async function testWithoutAntiDetection(): Promise<TestResult> {
  let browser: Browser | null = null;
  const result: TestResult = {
    lieScore: null,
    trustScore: null,
    passed: false,
  };

  try {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🧪 Testing WITHOUT Anti-Detection (Control)`);
    console.log(`${'═'.repeat(80)}\n`);

    console.log(`🚀 Launching Chromium...`);
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();
    console.log(`✅ Page created (NO anti-detection applied)\n`);

    console.log(`🌐 Navigating to CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    console.log(`✅ Page loaded\n`);

    console.log(`📊 Waiting for analysis (4 seconds)...`);
    await page.waitForTimeout(4000);

    console.log(`📊 Extracting fraud scores...\n`);

    try {
      const lieScoreText = await page.textContent('.lies');
      console.log(`Lie Score Text: ${lieScoreText}`);

      if (lieScoreText) {
        const match = lieScoreText.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          result.lieScore = parseFloat(match[1]);
        }
      }
    } catch (e: any) {
      console.log(`⚠️  Could not extract Lie Score: ${e.message}`);
    }

    if (result.lieScore !== null) {
      result.trustScore = 100 - result.lieScore;
      result.passed = result.lieScore < 20;
    }

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📊 RESULTS:`);
    console.log(`${'─'.repeat(80)}\n`);

    if (result.lieScore !== null) {
      console.log(`💬 Lie Score: ${result.lieScore.toFixed(1)}%`);
      console.log(`   Expected: > 50% (obvious bot)`);
      console.log(`   Status: ${result.lieScore > 50 ? '✅ EXPECTED' : '⚠️  UNEXPECTED'}\n`);
    } else {
      console.log(`⚠️  Could not extract Lie Score\n`);
    }

    console.log(`${'─'.repeat(80)}\n`);

    await context.close();
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  return result;
}

async function main() {
  console.log(`\n${'╔' + '═'.repeat(78) + '╗'}`);
  console.log(`║ ${'🛡️  ANTI-DETECTION SYSTEM TEST'.padEnd(76)} ║`);
  console.log(`║ ${'CreepJS Fraud Detection Analysis'.padEnd(76)} ║`);
  console.log(`${'╚' + '═'.repeat(78) + '╝'}`);

  try {
    // Test with anti-detection
    const withResults = await testWithAntiDetection();

    // Test without anti-detection
    const withoutResults = await testWithoutAntiDetection();

    // Summary
    console.log(`\n${'╔' + '═'.repeat(78) + '╗'}`);
    console.log(`║ ${'SUMMARY'.padEnd(76)} ║`);
    console.log(`${'╠' + '═'.repeat(78) + '╣'}`);

    if (withResults.lieScore !== null && withoutResults.lieScore !== null) {
      const diff = withoutResults.lieScore - withResults.lieScore;
      console.log(`║ WITH anti-detection:    Lie Score = ${withResults.lieScore.toFixed(1)}%`.padEnd(77) + '║');
      console.log(`║ WITHOUT anti-detection: Lie Score = ${withoutResults.lieScore.toFixed(1)}%`.padEnd(77) + '║');
      console.log(`║ Difference: ${diff.toFixed(1)}%`.padEnd(77) + '║');
      console.log(`║                                                                                ║`);

      if (diff > 30) {
        console.log(`║ ✅ ANTI-DETECTION IS WORKING! (Difference > 30%)`.padEnd(77) + '║');
      } else if (diff > 15) {
        console.log(`║ 🟡 ANTI-DETECTION PARTIALLY WORKING (Difference 15-30%)`.padEnd(77) + '║');
      } else {
        console.log(`║ ❌ ANTI-DETECTION NOT EFFECTIVE (Difference < 15%)`.padEnd(77) + '║');
      }
    }

    console.log(`${'╚' + '═'.repeat(78) + '╝'}\n`);
  } catch (error: any) {
    console.error(`\nFatal error: ${error.message}`);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
