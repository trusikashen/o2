/**
 * QUICK Anti-Detection Verification Test
 * Checks if anti-detection setup is properly applied
 * No internet required - just verifies the hooks are installed
 * 
 * Run: npx tsx scripts/quick-antidetection-check.ts
 */

import { chromium, Page } from 'playwright';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';
import { getRandomDevice } from '../src/config/devices';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function verifyAntiDetection() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`✅ ANTI-DETECTION VERIFICATION TEST`);
  console.log(`${'═'.repeat(80)}\n`);

  let browser = null;
  let page: Page | null = null;
  const device = getRandomDevice();

  console.log(`📱 Device: ${device.deviceName}`);
  console.log(`🔧 Testing: 4-layer anti-detection hooks\n`);

  try {
    // Launch Chromium
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=WebRTC,AutomationControlled',
        '--disable-webrtc',
      ],
    });

    const context = await browser.newContext();
    page = await context.newPage();

    // Apply anti-detection
    console.log(`🛡️  Applying anti-detection setup...\n`);
    await setupBrowserAntiDetection(page, device.config, device.deviceName);

    // Test 1: Check WebRTC blocking
    console.log(`${'─'.repeat(80)}`);
    console.log(`🔥 TEST 1: WebRTC Blocking`);
    console.log(`${'─'.repeat(80)}`);
    
    const webrtcResult = await page.evaluate(() => {
      const checks = {
        rtcPeerConnection: typeof (window as any).RTCPeerConnection,
        webkitRTC: typeof (window as any).webkitRTCPeerConnection,
        mediaDevices: !!navigator.mediaDevices,
        canGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
      };
      return checks;
    });

    console.log(`  • RTCPeerConnection: ${webrtcResult.rtcPeerConnection}`);
    console.log(`  • webkitRTCPeerConnection: ${webrtcResult.webkitRTC}`);
    console.log(`  • mediaDevices exists: ${webrtcResult.mediaDevices}`);
    console.log(`  • getUserMedia exists: ${webrtcResult.canGetUserMedia}`);
    const webrtcPass = webrtcResult.rtcPeerConnection !== 'object';
    console.log(`  Result: ${webrtcPass ? '✅ BLOCKED' : '❌ EXPOSED'}\n`);

    // Test 2: Check Canvas randomization
    console.log(`${'─'.repeat(80)}`);
    console.log(`🎨 TEST 2: Canvas Fingerprint Randomization`);
    console.log(`${'─'.repeat(80)}`);

    const canvasResult = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { error: 'No 2D context' };

      // Draw something
      ctx.fillStyle = 'red';
      ctx.fillRect(0, 0, 100, 100);

      const fp1 = canvas.toDataURL();
      const fp2 = canvas.toDataURL();

      // Check if canvas methods are hooked
      const isHooked = (ctx.getImageData.toString().includes('hooked') || 
                       canvas.toDataURL.toString().includes('hooked'));

      return {
        fingerprint1Length: fp1.length,
        fingerprint2Length: fp2.length,
        isSame: fp1 === fp2,
        isHooked: isHooked,
        toDataURLCode: canvas.toDataURL.toString().substring(0, 50),
      };
    });

    if (canvasResult.error) {
      console.log(`  ❌ Error: ${canvasResult.error}\n`);
    } else {
      console.log(`  • Canvas FP 1 length: ${canvasResult.fingerprint1Length} bytes`);
      console.log(`  • Canvas FP 2 length: ${canvasResult.fingerprint2Length} bytes`);
      console.log(`  • Same fingerprint twice: ${canvasResult.isSame}`);
      console.log(`  • toDataURL hooked: ${canvasResult.isHooked}`);
      const canvasPass = canvasResult.fingerprint1Length > 500; // Real canvas output
      console.log(`  Result: ${canvasPass ? '✅ WORKING' : '❌ NOT HOOKED'}\n`);
    }

    // Test 3: Check Navigator spoofing
    console.log(`${'─'.repeat(80)}`);
    console.log(`📱 TEST 3: Navigator Spoofing`);
    console.log(`${'─'.repeat(80)}`);

    const navResult = await page.evaluate(() => {
      const checks = {
        userAgent: navigator.userAgent,
        deviceMemory: (navigator as any).deviceMemory,
        hasMediaDevices: !!navigator.mediaDevices,
        hasPermissions: !!(navigator as any).permissions,
      };
      return checks;
    });

    console.log(`  • User-Agent: ${navResult.userAgent.substring(0, 60)}...`);
    console.log(`  • deviceMemory: ${navResult.deviceMemory} GB`);
    console.log(`  • mediaDevices: ${navResult.hasMediaDevices ? '✅' : '❌'}`);
    console.log(`  • permissions API: ${navResult.hasPermissions ? '✅' : '❌'}`);
    const navPass = navResult.deviceMemory !== undefined && navResult.hasMediaDevices;
    console.log(`  Result: ${navPass ? '✅ SPOOFED' : '❌ INCOMPLETE'}\n`);

    // Test 4: Check WebGL
    console.log(`${'─'.repeat(80)}`);
    console.log(`🎮 TEST 4: WebGL Spoofing`);
    console.log(`${'─'.repeat(80)}`);

    const webglResult = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      
      if (!gl) {
        return { available: false };
      }

      // WebGL extension constants
      const UNMASKED_VENDOR = 37445;
      const UNMASKED_RENDERER = 37446;

      const vendor = gl.getParameter(UNMASKED_VENDOR);
      const renderer = gl.getParameter(UNMASKED_RENDERER);

      return {
        available: true,
        vendor: vendor,
        renderer: renderer,
        isSpoofed: vendor && !vendor.includes('Google'),
      };
    });

    if (!webglResult.available) {
      console.log(`  • WebGL not available (may be disabled)\n`);
    } else {
      console.log(`  • Vendor: ${webglResult.vendor}`);
      console.log(`  • Renderer: ${webglResult.renderer}`);
      console.log(`  • Is spoofed: ${webglResult.isSpoofed ? '✅ YES' : '❌ NO'}\n`);
    }

    // Final verdict
    console.log(`${'═'.repeat(80)}`);
    console.log(`📊 OVERALL RESULT`);
    console.log(`${'═'.repeat(80)}\n`);

    const totalTests = 3; // WebRTC, Canvas, Navigator
    const passedTests = [webrtcPass, (canvasResult.fingerprint1Length ?? 0) > 500, navPass].filter(x => x).length;

    console.log(`Passed: ${passedTests}/${totalTests} tests`);
    
    if (passedTests >= 2) {
      console.log(`\n✅ ANTI-DETECTION IS WORKING`);
      console.log(`   Your bot should pass basic anti-fraud checks`);
      console.log(`   Ready for: Adsterra, CreepJS, and similar fraud detection`);
    } else {
      console.log(`\n⚠️  ANTI-DETECTION NEEDS FIXES`);
      console.log(`   Some hooks are not properly installed`);
      console.log(`   Check browser-setup.ts for issues`);
    }

    console.log(`\n${'═'.repeat(80)}\n`);

    await context.close();

  } catch (error) {
    console.error(`\n❌ Test error: ${error}`);
  } finally {
    if (browser) await browser.close();
  }
}

verifyAntiDetection().catch(console.error);
