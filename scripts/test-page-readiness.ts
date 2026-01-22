#!/usr/bin/env tsx
/**
 * Test script to check if page is ready before navigation
 * This helps identify the proper wait conditions needed
 */

import 'dotenv/config';
import { chromium, firefox, webkit, Browser, BrowserContext, Page, devices } from 'playwright';
import { sleep } from '../src/utils/helpers';

async function waitForPageReady(page: Page, browserType: string, maxWait: number = 120000): Promise<boolean> {
  const startTime = Date.now();
  const checkInterval = 1000; // Check every 1 second
  
  console.log(`   🔍 Waiting for browser/proxy connection to be ready...`);
  console.log(`   💡 Note: about:blank is normal - we're waiting for proxy connection, not URL change`);
  
  // Browser-specific wait times (proxy connection establishment)
  // Firefox removed due to proxy compatibility issues
  const browserProxyWait = browserType === 'chromium' ? 10000 : 5000;
  
  // First, wait for browser-specific proxy connection time
  console.log(`   ⏳ Waiting ${browserProxyWait/1000}s for ${browserType} proxy connection to establish...`);
  await sleep(browserProxyWait);
  
  // Then check if page context is actually ready (can access page properties)
  let readyChecks = 0;
  const maxReadyChecks = 5;
  
  while (Date.now() - startTime < maxWait && readyChecks < maxReadyChecks) {
    try {
      // Check if page object is accessible and responsive
      const currentUrl = page.url();
      const isError = currentUrl.includes('chrome-error') || 
                     currentUrl.includes('error') ||
                     currentUrl.includes('automationcontrolled');
      
      if (isError) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`   ⚠️  Page in error state: ${currentUrl.substring(0, 60)} (${elapsed}s elapsed)`);
        await sleep(checkInterval);
        continue;
      }
      
      // Try to access page properties to verify it's ready
      try {
        // Check if we can evaluate JavaScript (proves page context is ready)
        await page.evaluate(() => true);
        readyChecks++;
        
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        if (readyChecks >= 3) {
          // Page is ready after 3 successful checks
          console.log(`   ✅ Browser/proxy connection ready after ${elapsed}s!`);
          console.log(`   📍 Current URL: ${currentUrl} (about:blank is normal - ready to navigate)`);
          return true;
        }
      } catch (e) {
        // Page context not ready yet, continue waiting
      }
      
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 3 === 0 && elapsed > 0) {
        console.log(`   ⏳ Waiting for browser/proxy connection... (${elapsed}s elapsed, ${readyChecks}/${maxReadyChecks} ready checks)`);
      }
      
      await sleep(checkInterval);
    } catch (e) {
      // Page might be initializing, continue checking
      await sleep(checkInterval);
    }
  }
  
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  console.log(`   ⚠️  Page readiness check timed out after ${elapsed}s`);
  console.log(`   💡 But about:blank is fine - we can still try navigation`);
  return false; // Timeout, but we'll still try navigation
}

async function testBrowserReadiness(browserType: 'chromium' | 'firefox' | 'webkit') {
  console.log('\n' + '='.repeat(80));
  console.log(`🧪 TESTING ${browserType.toUpperCase()} PAGE READINESS`);
  console.log('='.repeat(80));
  
  const browserLauncher = browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  try {
    console.log(`\n1️⃣  Launching ${browserType} browser...`);
    const launchOptions: any = {
      headless: false,
      proxy: {
        server: 'http://brd.superproxy.io:33335',
        username: 'brd-customer-hl_d4382b99-zone-mb-session-test123-country-us',
        password: process.env.BRIGHTDATA_PASSWORD || '',
      },
    };
    
    // Add SSL ignore flags for Chromium
    if (browserType === 'chromium') {
      launchOptions.args = [
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--ignore-ssl-errors',
      ];
    }
    
    // Add SSL acceptance prefs for Firefox
    // NOTE: Do NOT set manual proxy settings here - let Playwright handle proxy via launchOptions.proxy
    // Manual proxy settings (network.proxy.type, network.proxy.http, etc.) conflict with Playwright's proxy management
    if (browserType === 'firefox') {
      launchOptions.firefoxUserPrefs = {
        'dom.webdriver.enabled': false,  // Hide automation
        'useAutomationExtension': false,
        'marionette.enabled': false, // Disable Marionette (Firefox automation)
        'media.peerconnection.enabled': false,  // Disable WebRTC (prevent IP leaks)
        'privacy.resistFingerprinting': false, // Disable fingerprinting resistance (can interfere with proxy)
        // CRITICAL: Accept SSL certificates from proxy (BrightData uses SSL interception)
        'security.ssl.insecure_fallback_hosts': 'effectivegatecpm.com,brd.superproxy.io',
        'security.ssl.require_safe_negotiation': false,
        'security.tls.insecure_fallback_hosts': 'effectivegatecpm.com,brd.superproxy.io',
        'security.tls.unrestricted_rc4_fallback': true,
        // Allow Playwright to manage proxy (prevents "proxy server is refusing connections")
        'network.proxy.allow_hijacking_localhost': true,
        // Additional settings to avoid proxy detection
        'network.http.sendRefererHeader': 2, // Always send referer (more realistic)
        'network.http.referer.spoofSource': false, // Don't spoof referer
        'network.http.sendSecureXSiteReferrer': true, // Send secure cross-site referrers
        'browser.cache.disk.enable': true, // Enable disk cache (more realistic)
        'browser.cache.memory.enable': true, // Enable memory cache
        'network.dns.disableIPv6': true, // Disable IPv6 (can leak real IP)
        'network.proxy.socks_remote_dns': false, // Not using SOCKS, so disable
        'network.proxy.socks_version': 0, // Not using SOCKS
      };
    }
    
    browser = await browserLauncher.launch(launchOptions);
    
    console.log(`2️⃣  Creating browser context...`);
    const contextOptions: any = {
      proxy: {
        server: 'http://brd.superproxy.io:33335',
        username: 'brd-customer-hl_d4382b99-zone-mb-session-test123-country-us',
        password: process.env.BRIGHTDATA_PASSWORD || '',
      },
      ignoreHTTPSErrors: true, // CRITICAL: Accept SSL certificates from proxy
    };
    
    // CRITICAL: For Firefox, use Playwright's built-in Desktop Firefox device profile
    // This matches the browser engine (Gecko) and prevents proxy errors
    if (browserType === 'firefox') {
      console.log(`   🔧 Using Playwright's Desktop Firefox device profile (engine match)`);
      contextOptions.viewport = devices['Desktop Firefox'].viewport;
      contextOptions.userAgent = devices['Desktop Firefox'].userAgent;
      contextOptions.deviceScaleFactor = devices['Desktop Firefox'].deviceScaleFactor;
      contextOptions.isMobile = devices['Desktop Firefox'].isMobile;
      contextOptions.hasTouch = devices['Desktop Firefox'].hasTouch;
      contextOptions.locale = 'en-US';
      contextOptions.timezoneId = 'America/New_York';
      // Add realistic headers to avoid proxy detection
      contextOptions.extraHTTPHeaders = {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      };
    }
    
    context = await browser.newContext(contextOptions);
    
    console.log(`3️⃣  Creating new page...`);
    const pageStart = Date.now();
    page = await context.newPage();
    const pageTime = Date.now() - pageStart;
    console.log(`   ✅ Page created in ${pageTime}ms`);
    
    console.log(`4️⃣  Initial URL check...`);
    const initialUrl = page.url();
    console.log(`   📍 Initial URL: ${initialUrl}`);
    
    // Wait for browser init (current approach)
    // Firefox removed - only Chromium and WebKit supported
    const browserInitDelay = browserType === 'chromium' ? 5000 : 2000;
    console.log(`\n5️⃣  Waiting ${browserInitDelay/1000}s for browser initialization (current approach)...`);
    await sleep(browserInitDelay);
    
    const urlAfterDelay = page.url();
    console.log(`   📍 URL after delay: ${urlAfterDelay}`);
    
    // NEW: Wait for page to be ready (up to 120s - network/proxy conditions vary)
    console.log(`\n6️⃣  Waiting for page to be ready (NEW approach - max 120s)...`);
    const isReady = await waitForPageReady(page, browserType, 120000);
    
    if (!isReady) {
      console.log(`   ⚠️  Page not ready after wait - this might cause navigation issues`);
    }
    
    // Try navigation
    console.log(`\n7️⃣  Attempting navigation...`);
    const navStart = Date.now();
    try {
      // Browser-specific navigation wait settings
      // Max 120s timeout - better to wait than fail
      const navWaitUntil = browserType === 'chromium' ? 'load' : 'domcontentloaded';
      const navTimeout = 120000; // 120s max for both browsers
      
      console.log(`   ⏳ Navigating with waitUntil: ${navWaitUntil}, timeout: ${navTimeout/1000}s...`);
      let response;
      try {
        response = await page.goto('https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221', {
          waitUntil: navWaitUntil,
          timeout: navTimeout,
        });
      } catch (navError: any) {
        // Handle ERR_HTTP_RESPONSE_CODE_FAILURE - page might still have navigated
        if (navError.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') || navError.message.includes('net::ERR')) {
          console.log(`   ⚠️  Navigation error (${navError.message}), but checking if page still loaded...`);
          const currentUrl = page.url();
          if (currentUrl !== 'about:blank' && !currentUrl.includes('chrome-error')) {
            console.log(`   ✅ Page still navigated to: ${currentUrl.substring(0, 80)}...`);
            // Try to get response from the page
            response = null; // Will check URL instead
          } else {
            throw navError; // Re-throw if we're still on error page
          }
        } else {
          throw navError; // Re-throw other errors
        }
      }
      const navTime = Date.now() - navStart;
      const currentUrl = page.url();
      if (response) {
        console.log(`   ✅ Navigation successful in ${navTime}ms | Status: ${response.status()}`);
      } else {
        console.log(`   ⚠️  Navigation completed with error handling in ${navTime}ms | Status: N/A (error handled)`);
      }
      console.log(`   📍 URL after navigation: ${currentUrl.substring(0, 100)}`);
      
      // Wait for network to settle (max 60s - better to wait than fail)
      console.log(`   ⏳ Waiting for network to settle (max 60s)...`);
      try {
        await page.waitForLoadState('networkidle', { timeout: 60000 });
        console.log(`   ✅ Network idle - redirects should be complete`);
      } catch (e) {
        console.log(`   ⚠️  Network not idle after 60s, but continuing...`);
      }
      
      // Additional wait for JavaScript redirects (Chromium needs more time)
      const urlBeforeJsWait = page.url();
      const jsWait = browserType === 'chromium' ? 5000 : 3000;
      console.log(`   ⏳ Waiting ${jsWait/1000}s for JavaScript redirects...`);
      await sleep(jsWait);
      
      const urlAfterJsWait = page.url();
      if (urlAfterJsWait !== urlBeforeJsWait) {
        console.log(`   🔄 JavaScript redirect detected: ${urlAfterJsWait.substring(0, 100)}`);
      }
      
    } catch (navError: any) {
      const navTime = Date.now() - navStart;
      console.log(`   ❌ Navigation failed after ${navTime}ms`);
      console.log(`   Error: ${navError.message}`);
      console.log(`   📍 Current URL: ${page.url().substring(0, 100)}`);
    }
    
    // Wait longer to see if redirects happen (Chrome needs more time)
    const redirectWait = browserType === 'chromium' ? 15000 : 10000;
    console.log(`\n8️⃣  Waiting ${redirectWait/1000}s to see if redirects occur...`);
    await sleep(redirectWait);
    const finalUrl = page.url();
    console.log(`   📍 Final URL after wait: ${finalUrl.substring(0, 100)}`);
    
    // Check if we reached final destination
    const isFinalDestination = !finalUrl.includes('effectivegatecpm.com') && 
                               !finalUrl.includes('api/users') &&
                               finalUrl !== 'about:blank' &&
                               !finalUrl.includes('chrome-error');
    
    if (isFinalDestination) {
      console.log(`   ✅ REACHED FINAL DESTINATION! This would count as impression.`);
    } else if (finalUrl.includes('api/users')) {
      console.log(`   ⚠️  On Adsterra API endpoint (may still redirect to final destination)`);
    } else if (finalUrl.includes('effectivegatecpm.com')) {
      console.log(`   ⚠️  Still on Adsterra domain (redirect may not have completed)`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ TEST COMPLETE');
    console.log('='.repeat(80) + '\n');
    
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.stack) {
      console.error(error.stack.split('\n').slice(0, 5).join('\n'));
    }
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// Run tests for each browser
// NOTE: Firefox removed due to proxy compatibility issues with BrightData
async function runAllTests() {
  const browsers: Array<'chromium' | 'webkit'> = ['chromium', 'webkit'];
  
  for (const browserType of browsers) {
    await testBrowserReadiness(browserType);
    if (browserType !== browsers[browsers.length - 1]) {
      console.log('\n⏳ Waiting 5 seconds before next browser test...\n');
      await sleep(5000);
    }
  }
}

// Check if specific browser provided
const browserArg = process.argv[2];
if (browserArg && ['chromium', 'firefox', 'webkit'].includes(browserArg)) {
  testBrowserReadiness(browserArg as 'chromium' | 'firefox' | 'webkit').catch(console.error);
} else {
  runAllTests().catch(console.error);
}

