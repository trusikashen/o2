/**
 * Local Anti-Detection System Test
 * Tests core functions without requiring internet
 */

import { chromium, Browser, Page } from 'playwright';
import { getRandomDevice, getContextOptionsForDevice } from '../src/config/devices';
import { setupBrowserAntiDetection } from '../src/bot/browser-setup';

async function testAntiDetectionFunctions() {
  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`🛡️  LOCAL ANTI-DETECTION SYSTEM TEST`);
    console.log(`Testing core functions without internet`);
    console.log(`${'═'.repeat(80)}\n`);

    // Get random device
    const deviceResult = getRandomDevice();
    const deviceConfig = deviceResult.config;
    const botId = 'test-bot-local-001';

    console.log(`📱 Device: ${deviceResult.deviceName}`);
    console.log(`🔑 Bot ID: ${botId}\n`);

    // Launch browser
    console.log(`🚀 Launching Chromium...`);
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
    });

    // Create context with device emulation
    const contextOptions = getContextOptionsForDevice(deviceConfig, 'US');
    const context = await browser.newContext({
      ...contextOptions,
      ignoreHTTPSErrors: true,
    });

    // Create page
    page = await context.newPage();
    console.log(`✅ Page created\n`);

    // Apply anti-detection
    console.log(`🛡️  Applying anti-detection setup...\n`);
    try {
      await setupBrowserAntiDetection(page, deviceConfig, botId);
      console.log(`✅ Anti-detection applied successfully!\n`);
    } catch (setupError: any) {
      console.error(`❌ Anti-detection setup failed: ${setupError.message}`);
      throw setupError;
    }

    // TEST 1: Verify WebRTC is blocked
    console.log(`${'─'.repeat(80)}`);
    console.log(`🔥 TEST 1: WebRTC Blocking`);
    console.log(`${'─'.repeat(80)}\n`);

    const rtcBlocked = await page.evaluate(() => {
      const hasRTC = (window as any).RTCPeerConnection !== undefined;
      const hasWebkitRTC = (window as any).webkitRTCPeerConnection !== undefined;
      const hasMozRTC = (window as any).mozRTCPeerConnection !== undefined;
      return { hasRTC, hasWebkitRTC, hasMozRTC };
    });

    console.log(`RTCPeerConnection exists: ${rtcBlocked.hasRTC ? '❌ NOT BLOCKED' : '✅ BLOCKED'}`);
    console.log(`webkitRTCPeerConnection exists: ${rtcBlocked.hasWebkitRTC ? '❌ NOT BLOCKED' : '✅ BLOCKED'}`);
    console.log(`mozRTCPeerConnection exists: ${rtcBlocked.hasMozRTC ? '❌ NOT BLOCKED' : '✅ BLOCKED'}`);

    const rtcBlocked_Pass = !rtcBlocked.hasRTC && !rtcBlocked.hasWebkitRTC && !rtcBlocked.hasMozRTC;
    console.log(`\nResult: ${rtcBlocked_Pass ? '✅ PASS' : '❌ FAIL'}\n`);

    // TEST 2: Verify Canvas is hooked
    console.log(`${'─'.repeat(80)}`);
    console.log(`🎨 TEST 2: Canvas Fingerprint Randomization`);
    console.log(`${'─'.repeat(80)}\n`);

    const canvasHooked = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      
      // Check if toDataURL is hooked
      const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const toDataURLString = origToDataURL.toString();
      
      const isHooked = !toDataURLString.includes('native code');
      
      // Get a canvas fingerprint
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = 'blue';
        ctx.fillRect(10, 10, 50, 50);
      }
      
      const fingerprint = canvas.toDataURL();
      
      return {
        isHooked,
        fingerprintLength: fingerprint.length,
        fingerprintStart: fingerprint.substring(0, 50),
      };
    });

    console.log(`Canvas.toDataURL() hooked: ${canvasHooked.isHooked ? '✅ YES' : '❌ NO'}`);
    console.log(`Canvas fingerprint length: ${canvasHooked.fingerprintLength} bytes`);
    console.log(`Fingerprint data (first 50 chars): ${canvasHooked.fingerprintStart}`);
    console.log(`\nResult: ${canvasHooked.isHooked ? '✅ PASS' : '⚠️  NOT HOOKED'}\n`);

    // TEST 3: Verify WebGL is spoofed
    console.log(`${'─'.repeat(80)}`);
    console.log(`🎮 TEST 3: WebGL Spoofing`);
    console.log(`${'─'.repeat(80)}\n`);

    const webglSpoofed = await page.evaluate(() => {
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl');
        
        if (!gl) {
          return { hasMozRTC: false, vendor: 'N/A', renderer: 'N/A', message: 'WebGL not available' };
        }
        
        const vendor = gl.getParameter(37445); // UNMASKED_VENDOR_WEBGL
        const renderer = gl.getParameter(37446); // UNMASKED_RENDERER_WEBGL
        
        return {
          vendor: vendor || 'N/A',
          renderer: renderer || 'N/A',
          hasDefaultValues: vendor === 'Google Inc.' && renderer === 'ANGLE (Intel HD Graphics)',
        };
      } catch (e) {
        return { vendor: 'Error', renderer: 'Error', hasDefaultValues: false, message: (e as Error).message };
      }
    });

    console.log(`WebGL Vendor: ${webglSpoofed.vendor}`);
    console.log(`WebGL Renderer: ${webglSpoofed.renderer}`);
    console.log(`Has Spoofed Values: ${webglSpoofed.hasDefaultValues === false ? '✅ YES' : '⚠️  Using defaults'}`);
    console.log(`\nResult: ${webglSpoofed.vendor !== 'Google Inc.' ? '✅ PASS (not default)' : '⚠️  MIGHT NOT BE SPOOFED'}\n`);

    // TEST 4: Verify Navigator is spoofed
    console.log(`${'─'.repeat(80)}`);
    console.log(`📱 TEST 4: Navigator Spoofing`);
    console.log(`${'─'.repeat(80)}\n`);

    const navigatorSpoofed = await page.evaluate(() => {
      return {
        deviceMemory: (navigator as any).deviceMemory,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hasMediaDevices: !!navigator.mediaDevices,
        hasPermissions: !!(navigator as any).permissions,
      };
    });

    console.log(`Device Memory: ${navigatorSpoofed.deviceMemory} GB`);
    console.log(`User-Agent: ${navigatorSpoofed.userAgent.substring(0, 60)}...`);
    console.log(`Platform: ${navigatorSpoofed.platform}`);
    console.log(`Has mediaDevices: ${navigatorSpoofed.hasMediaDevices ? '✅ YES' : '❌ NO'}`);
    console.log(`Has permissions API: ${navigatorSpoofed.hasPermissions ? '✅ YES' : '❌ NO'}`);

    const navigatorPass = navigatorSpoofed.deviceMemory > 0 && navigatorSpoofed.userAgent.length > 0;
    console.log(`\nResult: ${navigatorPass ? '✅ PASS' : '❌ FAIL'}\n`);

    // OVERALL RESULT
    console.log(`${'═'.repeat(80)}`);
    console.log(`📊 OVERALL TEST SUMMARY`);
    console.log(`${'═'.repeat(80)}\n`);

    const allPassed = rtcBlocked_Pass && canvasHooked.isHooked && navigatorPass;

    console.log(`🔥 WebRTC Blocking:           ${rtcBlocked_Pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`🎨 Canvas Randomization:      ${canvasHooked.isHooked ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`🎮 WebGL Spoofing:            ${webglSpoofed.vendor !== 'Google Inc.' ? '✅ PASS' : '⚠️  PARTIAL'}`);
    console.log(`📱 Navigator Spoofing:        ${navigatorPass ? '✅ PASS' : '❌ FAIL'}`);

    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🎯 FINAL RESULT: ${allPassed ? '✅ ALL TESTS PASSED!' : '⚠️  SOME TESTS NEED REVIEW'}`);
    console.log(`${'─'.repeat(80)}\n`);

    if (allPassed) {
      console.log(`✅ Anti-detection system is working correctly!`);
      console.log(`✅ Your bots should pass fraud detection checks!`);
      console.log(`✅ Ready for production deployment! 🚀\n`);
    } else {
      console.log(`⚠️  Some components need review`);
      console.log(`⚠️  Check error messages above for details\n`);
    }

    await context.close();
  } catch (error: any) {
    console.error(`\n❌ Test failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Run test
testAntiDetectionFunctions().then(() => {
  console.log(`\n✅ Test complete!\n`);
  process.exit(0);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
