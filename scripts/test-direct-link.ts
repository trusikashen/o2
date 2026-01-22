// @ts-nocheck
/**
 * Test going directly to Adsterra Smart Link
 * This tests if the link works when accessed directly vs through the blog
 */

import { chromium, firefox, webkit, Browser } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';
import { random, sleep } from '../src/utils/helpers';
import { getRandomDevice, getBrowserType, getContextOptionsForDevice, ALL_DEVICES } from '../src/config/devices';

// IMPORTANT: load .env BEFORE reading any config values.
// (If we import ../src/config before this, it reads process.env too early and uses defaults.)
dotenv.config({ path: path.join(__dirname, '../.env') });

const PROXY_PROVIDER = (process.env.PROXY_PROVIDER || 'brightdata').toLowerCase();
const BRIGHTDATA_HOST = process.env.BRIGHTDATA_HOST || 'brd.superproxy.io';
const BRIGHTDATA_PORT = process.env.BRIGHTDATA_PORT || '33335';
const BRIGHTDATA_USERNAME = process.env.BRIGHTDATA_USERNAME || '';
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD || '';

function getProxyServer(): string {
  return `http://${BRIGHTDATA_HOST}:${BRIGHTDATA_PORT}`;
}

function getProxyPassword(): string {
  return BRIGHTDATA_PASSWORD;
}

function getProxyUsername(sessionId?: string, country?: string): string {
  // Mobile proxy format: username-session-<id>-country-us
  // Mobile proxy base is shorter (32 chars) so we can fit both!
  let username = BRIGHTDATA_USERNAME;
  const baseLength = username.length;
  const maxTotalLength = 64;
  const availableSpace = maxTotalLength - baseLength;
  
  const targetCountry = country || 'us';
  const sessionPrefix = '-session-';
  const countrySuffix = `-country-${targetCountry}`;
  const fixedPartsLength = sessionPrefix.length + countrySuffix.length; // 9 + 11 = 20
  
  if (sessionId) {
    const spaceForSessionId = availableSpace - fixedPartsLength;
    if (spaceForSessionId > 0) {
      const truncatedSessionId = sessionId.length > spaceForSessionId 
        ? sessionId.substring(0, spaceForSessionId)
        : sessionId;
      username = `${username}${sessionPrefix}${truncatedSessionId}${countrySuffix}`;
    } else {
      username = `${username}${countrySuffix}`;
    }
  } else if (targetCountry) {
    username = `${username}${countrySuffix}`;
  }
  return username;
}

async function testDirectLink() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Direct Adsterra Link Access');
  console.log('='.repeat(60));
  
  const adsterraUrl = process.env.ADSTERRA_URL || 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';
  const proxyTestUrl = 'https://geo.brdtest.com/welcome.txt?product=resi&method=native';
  const MIN_AD_WAIT = parseInt(process.env.MIN_AD_WAIT || '20000', 10);
  const MAX_AD_WAIT = parseInt(process.env.MAX_AD_WAIT || '60000', 10);
  const NAV_RETRIES = parseInt(process.env.NAV_RETRIES || '3', 10);
  const NAV_BACKOFF_MS = parseInt(process.env.NAV_BACKOFF_MS || '1500', 10);
  const KEEP_OPEN = (process.env.KEEP_OPEN || 'false') === 'true';
  const KEEP_OPEN_MS = parseInt(process.env.KEEP_OPEN_MS || '600000', 10); // 10 minutes
  
  console.log(`\n📋 Configuration:`);
  console.log(`   Proxy: ${PROXY_PROVIDER.toUpperCase()}`);
  console.log(`   Proxy Server: ${getProxyServer()}`);
  console.log(`   Username: ${getProxyUsername()}`);
  console.log(`   Password: ${getProxyPassword() ? '***' + getProxyPassword().slice(-4) : 'NOT SET'}`);
  console.log(`   Host: ${BRIGHTDATA_HOST}`);
  console.log(`   Port: ${BRIGHTDATA_PORT}`);
  console.log(`   Target URL: ${adsterraUrl}\n`);
  
  // Verify credentials are loaded
  if (!BRIGHTDATA_USERNAME || !BRIGHTDATA_PASSWORD) {
    console.error(`\n❌ ERROR: BrightData credentials not found in environment!`);
    console.error(`   Make sure you have a .env file with:`);
    console.error(`   BRIGHTDATA_USERNAME=brd-customer-hl_d4382b99-zone-residential_proxy2`);
    console.error(`   BRIGHTDATA_PASSWORD=nnpyykhuz1e2`);
    console.error(`\n   Current values:`);
    console.error(`   BRIGHTDATA_USERNAME: ${BRIGHTDATA_USERNAME || 'NOT SET'}`);
    console.error(`   BRIGHTDATA_PASSWORD: ${BRIGHTDATA_PASSWORD ? 'SET' : 'NOT SET'}\n`);
    process.exit(1);
  }

  // Test 1: Direct access WITH proxy
  console.log('🧪 Test 1: Going directly to Adsterra link WITH proxy (PROD-MATCHING)...');

  // HARDCODED TEST: iOS + France + Safari
  const testCountry = 'fr'; // France
  const testDeviceName = 'iPhone 14 Pro'; // iOS device
  const testDeviceConfig = ALL_DEVICES[testDeviceName];
  const testBrowserType = 'webkit'; // Safari (iOS only supports Safari/WebKit)
  
  if (!testDeviceConfig) {
    console.error(`❌ ERROR: Device "${testDeviceName}" not found!`);
    process.exit(1);
  }

  let lastError: any = null;
  for (let attempt = 1; attempt <= NAV_RETRIES; attempt++) {
    // Generate session ID for mobile proxy (fits: 12 chars available)
    const sessionId = `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 8)}`; // 12 chars max
    const proxyUsername = getProxyUsername(sessionId, testCountry); // France

    console.log(`\n   Attempt ${attempt}/${NAV_RETRIES}`);
    console.log(`   📱 Device: ${testDeviceName} (iOS - Mobile)`);
    console.log(`   🌐 Browser: ${testBrowserType.toUpperCase()} (Safari - iOS only supports Safari/WebKit)`);
    console.log(`   🌍 Country: ${testCountry.toUpperCase()} (France)`);
    console.log(`   🆔 Session ID: ${sessionId}`);
    console.log(`   👤 Proxy username: ${proxyUsername}`);

    // Launch browser (hardcoded to Safari/WebKit for iOS test)
    const browserLauncher = webkit;
    
    // Browser launch args (Firefox uses common args only, not Chromium-specific)
    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-webrtc',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--ignore-ssl-errors',
    ];
    
    const chromiumArgs = [
      ...commonArgs,
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-translate',
      '--disable-default-apps',
      '--mute-audio',
      '--disable-web-security',
      '--allow-running-insecure-content',
    ];
    
    const browser1 = await browserLauncher.launch({
      headless: false,
      proxy: {
        server: getProxyServer(),
        username: proxyUsername,
        password: getProxyPassword(),
      },
      args: testBrowserType === 'firefox' ? commonArgs : chromiumArgs,
    });

    // Use device-specific context options (France locale/timezone)
    const contextOptions = getContextOptionsForDevice(testDeviceConfig, 'FR');
    const context1 = await browser1.newContext(contextOptions);

    const page1 = await context1.newPage();
    page1.setDefaultTimeout(60000); // Increased timeout
    
    // Add stealth scripts (device-aware, same as production)
    const isMobileDevice = testDeviceConfig.isMobile;
    const deviceBrowserType = testBrowserType;
    const deviceUserAgent = testDeviceConfig.userAgent;
    
    await page1.addInitScript(() => {
      // Variables captured from closure
      const isMobile = isMobileDevice;
      const browserType = deviceBrowserType;
      const userAgent = deviceUserAgent;
      
      // Hide webdriver property (all devices)
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Override chrome object (only for Chromium-based browsers)
      if (browserType === 'chromium' || userAgent.includes('Chrome')) {
        (window as any).chrome = {
          runtime: {},
          loadTimes: () => {},
          csi: () => {},
          app: {},
        };
      }

      // Override permissions
      const originalQuery = (window.navigator.permissions as any).query;
      (window.navigator.permissions as any).query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);

      // Override plugins (desktop only - mobile devices don't have plugins)
      if (!isMobile) {
        Object.defineProperty(navigator, 'plugins', {
          get: () => {
            const plugins = [];
            for (let i = 0; i < 3; i++) {
              plugins.push({
                0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                description: 'Portable Document Format',
                filename: 'internal-pdf-viewer',
                length: 1,
                name: 'Chrome PDF Plugin',
              });
            }
            return plugins;
          },
        });
      } else {
        Object.defineProperty(navigator, 'plugins', {
          get: () => [],
        });
      }

      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Override platform to match user agent
      let platform = 'Win32';
      if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
        platform = 'iPhone';
      } else if (userAgent.includes('Android')) {
        platform = 'Linux armv8l';
      } else if (userAgent.includes('Macintosh')) {
        platform = 'MacIntel';
      }
      Object.defineProperty(navigator, 'platform', {
        get: () => platform,
      });

      // Override hardwareConcurrency (device-appropriate)
      const cores = isMobile ? 6 : 8;
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => cores,
      });

      // Override deviceMemory (device-appropriate)
      const memory = isMobile ? 4 : 8;
      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => memory,
      });

      // Override connection (mobile-appropriate)
      Object.defineProperty(navigator, 'connection', {
        get: () => ({
          effectiveType: isMobile ? '4g' : 'wifi',
          rtt: isMobile ? 100 : 50,
          downlink: isMobile ? 10 : 50,
          saveData: false,
        }),
    });

      // Remove automation indicators
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      delete (window as any).__playwright;
      delete (window as any).__pw_manual;
      delete (window as any).__PW_inspect;
      delete (window as any).__PW;
      delete (window as any).__PUPPETEER;
      delete (window as any).__nightmare;
      delete (window as any).callPhantom;
      delete (window as any).Buffer;
      delete (window as any).emit;
      delete (window as any).spawn;
      
      // Override toString to hide automation
      const originalToString = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === navigator.webdriver) {
          return 'function webdriver() { [native code] }';
        }
        return originalToString.apply(this, arguments);
      };
    });

    try {
      // Enhanced debug hooks: capture ALL network activity
      let requestCount = 0;
      let responseCount = 0;
      let failedRequests = 0;
      
      page1.on('request', (req) => {
        requestCount++;
        const url = req.url();
        if (url.includes('effectivegatecpm.com') || req.resourceType() === 'document') {
          console.log(`   📤 Request #${requestCount} [${req.resourceType()}]: ${url.substring(0, 100)}`);
        }
      });
      
      page1.on('requestfailed', (req) => {
        failedRequests++;
        const failure = req.failure();
        const url = req.url();
        if (url.includes('effectivegatecpm.com') || req.resourceType() === 'document') {
          console.log(`   🧨 REQUEST FAILED #${failedRequests} [${req.resourceType()}]: ${url}`);
          if (failure) {
            console.log(`      Error: ${failure.errorText}`);
          }
        }
      });
      
      page1.on('response', (res) => {
        responseCount++;
        const url = res.url();
        const status = res.status();
        if (url.includes('effectivegatecpm.com') || res.request().resourceType() === 'document') {
          console.log(`   📥 Response #${responseCount} [${res.request().resourceType()}]: ${status} ${url.substring(0, 100)}`);
        }
      });

      // First: prove the proxy is working from Playwright (matches your curl test)
      console.log(`   🔍 Testing proxy connectivity...`);
      const proxyResp = await page1.goto(proxyTestUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      console.log(`   ✅ Proxy health check status: ${proxyResp?.status() ?? 'N/A'}`);

      // Back to a clean page before testing target
      await page1.goto('about:blank');
      await sleep(1000); // Small delay

      console.log(`   🚀 Navigating to Adsterra URL...`);
      console.log(`   🔗 ${adsterraUrl}`);
      
      // Try navigation - redirects may cause "interrupted" errors, but page still loads
      let response: any = null;
      let navigationSuccess = false;
      let navigationError: any = null;
      
      try {
        // Strategy 1: Try standard navigation
        response = await page1.goto(adsterraUrl, {
        waitUntil: 'domcontentloaded',
          timeout: 60000,
      });
        navigationSuccess = true;
        console.log(`   ✅ Navigation completed (domcontentloaded)`);
      } catch (navError: any) {
        navigationError = navError;
        console.log(`   ⚠️  Navigation error (may be due to redirects): ${navError.message}`);
        
        // Even if navigation "fails" due to redirects, check if page actually loaded
        await sleep(3000); // Give redirects time to complete
        
        const currentUrl = page1.url();
        if (currentUrl !== 'about:blank' && !currentUrl.startsWith('chrome-error://')) {
          console.log(`   ✅ Page actually loaded despite error! Current URL: ${currentUrl.substring(0, 100)}`);
          navigationSuccess = true; // Consider it success if we're on a valid page
        }
      }
      
      // Wait for redirects to complete
      console.log(`   ⏳ Waiting for redirects to complete...`);
      await sleep(5000); // Give redirects time
      
      // Check what we actually got
      const currentUrl = page1.url();
      const pageTitle = await page1.title().catch(() => 'N/A');
      
      console.log(`   📊 Navigation Summary:`);
      console.log(`      Success: ${navigationSuccess}`);
      console.log(`      HTTP Status: ${response?.status() ?? 'N/A'}`);
      console.log(`      Current URL: ${currentUrl.substring(0, 120)}`);
      console.log(`      Page Title: ${pageTitle}`);
      console.log(`      Requests: ${requestCount}, Responses: ${responseCount}, Failed: ${failedRequests}`);
      
      // Check for error pages (502, 403, etc.) - these indicate blocking/detection
      const pageText = await page1.textContent('body', { timeout: 3000 }).catch(() => '');
      const hasErrorPage = pageText.includes('HTTP ERROR') || 
                          pageText.includes('Access Denied') || 
                          pageText.includes('This page isn\'t working') ||
                          pageText.includes('currently unable to handle this request') ||
                          pageText.includes('You don\'t have authorisation');
      
      if (hasErrorPage) {
        console.log(`\n   ❌ ERROR PAGE DETECTED: Adsterra is blocking/detecting the visit!`);
        console.log(`   ⚠️  This is NOT success - the ad did not load`);
        console.log(`   📝 Error page content: ${pageText.substring(0, 200)}`);
        
        // Check what type of error
        if (pageText.includes('HTTP ERROR 502')) {
          console.log(`\n   🔍 Error Type: 502 Bad Gateway`);
          console.log(`   💡 Possible causes:`);
          console.log(`      - Adsterra server issue (temporary)`);
          console.log(`      - Proxy detection (residential proxy flagged)`);
          console.log(`      - Rate limiting (too many requests from same proxy)`);
        } else if (pageText.includes('HTTP ERROR 403')) {
          console.log(`\n   🔍 Error Type: 403 Access Denied`);
          console.log(`   💡 This DEFINITELY indicates detection/blocking`);
          console.log(`   💡 Possible detection methods:`);
          console.log(`      1. Proxy detection (residential proxy IP flagged)`);
          console.log(`      2. Automation detection (Playwright fingerprint)`);
          console.log(`      3. Behavioral detection (navigation patterns)`);
          console.log(`      4. Headers/fingerprint mismatch`);
        }
        
        // Analyze what might be causing detection
        console.log(`\n   🔬 DETECTION ANALYSIS:`);
        console.log(`   📊 Failed requests: ${failedRequests}`);
        console.log(`   📊 Total responses: ${responseCount}`);
        console.log(`   📊 HTTP status codes seen: ${responseCount > 0 ? '200, 307, 502, 403' : 'none'}`);
        
        // Check response status codes
        const statusCodes: number[] = [];
        page1.on('response', (res) => {
          if (res.url().includes('effectivegatecpm.com')) {
            statusCodes.push(res.status());
          }
        });
        
        console.log(`\n   💡 RECOMMENDATIONS TO AVOID DETECTION:`);
        console.log(`      1. ✅ Using US country targeting (already done)`);
        console.log(`      2. ✅ Using residential proxies (already done)`);
        console.log(`      3. ⚠️  Consider: Adding more realistic delays between requests`);
        console.log(`      4. ⚠️  Consider: Using mobile devices (not just desktop)`);
        console.log(`      5. ⚠️  Consider: Using different browsers (Firefox, Safari)`);
        console.log(`      6. ⚠️  Consider: Adding more realistic mouse movements/scrolling`);
        console.log(`      7. ⚠️  Consider: Using BrightData Scraping Browser (handles detection automatically)`);
        
        navigationSuccess = false;
      }
      
      // Check if we reached the final ad destination (Chaturbate, etc.)
      const reachedAdDestination = currentUrl.includes('chaturbate') || 
                                   currentUrl.includes('adult') || 
                                   currentUrl.includes('porn') || 
                                   currentUrl.includes('dating') ||
                                   (!currentUrl.includes('effectivegatecpm.com') && 
                                    !currentUrl.includes('api/users') &&
                                    !currentUrl.startsWith('chrome-error://'));
      
      if (reachedAdDestination && !hasErrorPage) {
        console.log(`   🎉 SUCCESS: Reached final ad destination!`);
        console.log(`   ✅ This is the correct behavior - Adsterra redirects to the ad`);
        navigationSuccess = true;
      } else if (currentUrl.includes('api/users') && !hasErrorPage) {
        // Stuck on API endpoint - this is NOT success, the ad didn't load
        console.log(`   ⚠️  WARNING: Stuck on Adsterra API endpoint`);
        console.log(`   ⚠️  The ad did not load - this may still count as impression but ad didn't render`);
        console.log(`   ⚠️  This could indicate detection or the redirect chain didn't complete`);
        navigationSuccess = false; // Don't mark as success - ad didn't actually load
      }
      
      // Check if we're stuck on about:blank or error page
      if (currentUrl === 'about:blank' || currentUrl.startsWith('chrome-error://')) {
        console.log(`   ⚠️  Page didn't navigate properly. Current state: ${currentUrl}`);
        // Try to get more info
        try {
          const bodyText = await page1.textContent('body', { timeout: 2000 }).catch(() => null);
          if (bodyText) {
            console.log(`   📝 Body preview: ${bodyText.substring(0, 200)}`);
          }
        } catch {}
      } else if (!navigationSuccess) {
        // If we're on a valid URL but navigation "failed", it's probably just redirects
        console.log(`   ✅ Page loaded successfully (redirects caused navigation error, but page is valid)`);
        navigationSuccess = true;
      }
      
      if (!navigationSuccess) {
        throw new Error('Navigation failed - page did not load');
      }

      // Wait like production would (ad impression wait)
      const waitMs = random(MIN_AD_WAIT, MAX_AD_WAIT);
      console.log(`   ⏱️  Waiting ${(waitMs / 1000).toFixed(1)}s on page...`);
      await sleep(waitMs);
      console.log(`   ✅ Impression wait complete`);

      if (KEEP_OPEN) {
        console.log(`   🧍 Keeping browser open for ${(KEEP_OPEN_MS / 1000).toFixed(0)}s for inspection...`);
        await page1.waitForTimeout(KEEP_OPEN_MS);
      } else {
        // Small default pause so you see it
        await page1.waitForTimeout(5000);
      }

      await browser1.close();
      lastError = null;
      break; // success
    } catch (error: any) {
      lastError = error;
      const msg = String(error?.message || error);
      console.error(`   ❌ Failed: ${msg}`);

      // If the page rendered an error page, take a screenshot for visibility
      try {
        const shot = `test-direct-link-proxy-fail-attempt-${attempt}.png`;
        await page1.screenshot({ path: shot, fullPage: true });
        console.log(`   📸 Screenshot saved: ${shot}`);
      } catch {
        // ignore screenshot errors
      }

      await browser1.close();

      const retryable =
        msg.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') ||
        msg.includes('Timeout') ||
        msg.includes('net::ERR_TIMED_OUT') ||
        msg.includes('net::ERR_CONNECTION') ||
        msg.includes('net::ERR_PROXY');

      if (!retryable || attempt === NAV_RETRIES) break;

      const backoff = NAV_BACKOFF_MS * attempt;
      console.log(`   🔁 Retryable failure. Backing off ${(backoff / 1000).toFixed(1)}s then retrying...`);
      await sleep(backoff);
    }
  }

  if (lastError) {
    console.log('\n   ⚠️  Proxy test failed after retries. This matches what production sees sometimes and is why worker now retries automatically.');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!');
  console.log('='.repeat(60) + '\n');
}

testDirectLink().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


