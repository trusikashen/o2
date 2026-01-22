#!/usr/bin/env tsx
/**
 * Test multiple Firefox device configurations to find what works with proxy
 * Quickly tests different setups to identify working configuration
 */

import 'dotenv/config';
import { firefox, Browser, BrowserContext, Page, devices } from 'playwright';
import { sleep } from '../src/utils/helpers';

const PROXY_SERVER = 'http://brd.superproxy.io:33335';
const PROXY_USERNAME = 'brd-customer-hl_d4382b99-zone-mb-session-test123-country-us';
const PROXY_PASSWORD = process.env.BRIGHTDATA_PASSWORD || '';
const TEST_URL = 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';

interface TestConfig {
  name: string;
  firefoxUserPrefs?: Record<string, any>;
  contextOptions?: Record<string, any>;
  launchArgs?: string[];
}

// Different Firefox configurations to test
const FIREFOX_CONFIGS: TestConfig[] = [
  {
    name: '1. Minimal (no prefs, no custom context)',
    firefoxUserPrefs: {},
    contextOptions: {},
  },
  {
    name: '2. Only ignoreHTTPSErrors',
    firefoxUserPrefs: {},
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '3. Desktop Firefox device (Playwright built-in)',
    firefoxUserPrefs: {},
    contextOptions: {
      ...devices['Desktop Firefox'],
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '4. Custom Windows Firefox UA',
    firefoxUserPrefs: {},
    contextOptions: {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '5. Mobile Firefox (Android)',
    firefoxUserPrefs: {},
    contextOptions: {
      viewport: { width: 360, height: 800 },
      userAgent: 'Mozilla/5.0 (Android 12; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '6. Minimal prefs + WebRTC disabled',
    firefoxUserPrefs: {
      'media.peerconnection.enabled': false,
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '7. Anti-detection prefs (no SSL settings)',
    firefoxUserPrefs: {
      'dom.webdriver.enabled': false,
      'media.peerconnection.enabled': false,
      'privacy.resistFingerprinting': false,
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '8. Full anti-detection + SSL prefs',
    firefoxUserPrefs: {
      'dom.webdriver.enabled': false,
      'media.peerconnection.enabled': false,
      'privacy.resistFingerprinting': false,
      'security.ssl.insecure_fallback_hosts': 'effectivegatecpm.com,brd.superproxy.io',
      'security.ssl.require_safe_negotiation': false,
      'security.tls.insecure_fallback_hosts': 'effectivegatecpm.com,brd.superproxy.io',
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },
  {
    name: '9. No proxy in launch, only in context',
    firefoxUserPrefs: {},
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
    // Special: will skip proxy in launch
  },
  {
    name: '10. HTTP/1.1 only (disable HTTP/2)',
    firefoxUserPrefs: {
      'network.http.spdy.enabled': false,
      'network.http.spdy.enabled.http2': false,
      'network.http.spdy.enabled.v3-1': false,
    },
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },
];

async function waitForPageReady(page: Page, maxWait: number = 30000): Promise<boolean> {
  const startTime = Date.now();
  let readyChecks = 0;
  const maxReadyChecks = 3;
  
  while (Date.now() - startTime < maxWait && readyChecks < maxReadyChecks) {
    try {
      const currentUrl = page.url();
      const isError = currentUrl.includes('chrome-error') || currentUrl.includes('error');
      
      if (isError) {
        await sleep(1000);
        continue;
      }
      
      // Check if page context is ready
      await page.evaluate(() => true);
      readyChecks++;
      
      if (readyChecks >= 3) {
        return true;
      }
    } catch (e) {
      // Page not ready yet
    }
    await sleep(1000);
  }
  return readyChecks >= 1; // At least one check passed
}

async function testConfig(config: TestConfig, index: number): Promise<{ name: string; success: boolean; error?: string; finalUrl?: string }> {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🧪 Testing: ${config.name}`);
  console.log('='.repeat(70));
  
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;
  
  try {
    // Launch options
    const launchOptions: any = {
      headless: false,
      ...(config.launchArgs ? { args: config.launchArgs } : {}),
    };
    
    // Config 9 is special: no proxy in launch
    if (config.name !== '9. No proxy in launch, only in context') {
      launchOptions.proxy = {
        server: PROXY_SERVER,
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
      };
    }
    
    // Add Firefox user prefs if any
    if (config.firefoxUserPrefs && Object.keys(config.firefoxUserPrefs).length > 0) {
      launchOptions.firefoxUserPrefs = config.firefoxUserPrefs;
    }
    
    console.log(`   📋 Launch prefs: ${Object.keys(config.firefoxUserPrefs || {}).length} settings`);
    
    browser = await firefox.launch(launchOptions);
    
    // Context options
    const contextOptions: any = {
      proxy: {
        server: PROXY_SERVER,
        username: PROXY_USERNAME,
        password: PROXY_PASSWORD,
      },
      ...config.contextOptions,
    };
    
    console.log(`   📋 Context options: ${Object.keys(config.contextOptions || {}).join(', ') || 'none'}`);
    
    context = await browser.newContext(contextOptions);
    page = await context.newPage();
    
    // CRITICAL: Wait for Firefox proxy connection to establish (12s like original script)
    console.log(`   ⏳ Waiting 12s for Firefox proxy connection...`);
    await sleep(12000);
    
    // Wait for page to be ready
    console.log(`   🔍 Checking page readiness...`);
    const isReady = await waitForPageReady(page, 15000);
    console.log(`   ${isReady ? '✅' : '⚠️'} Page ready: ${isReady}`);
    
    // Try navigation
    console.log(`   ⏳ Navigating to test URL...`);
    const navStart = Date.now();
    
    const response = await page.goto(TEST_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    
    const navTime = Date.now() - navStart;
    const status = response?.status() || 0;
    console.log(`   📊 Navigation: ${navTime}ms | Status: ${status}`);
    console.log(`   📍 URL after nav: ${page.url().substring(0, 70)}...`);
    
    // Wait for network to settle
    console.log(`   ⏳ Waiting for network idle...`);
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
      console.log(`   ✅ Network idle`);
    } catch (e) {
      console.log(`   ⚠️  Network not idle after 10s, continuing...`);
    }
    
    // Wait for JavaScript redirects (important!)
    console.log(`   ⏳ Waiting 5s for JavaScript redirects...`);
    await sleep(5000);
    
    const urlAfterJsWait = page.url();
    console.log(`   📍 URL after JS wait: ${urlAfterJsWait.substring(0, 70)}...`);
    
    // Additional wait for final redirects (10s like original)
    console.log(`   ⏳ Waiting 10s for final redirects...`);
    await sleep(10000);
    
    const finalUrl = page.url();
    console.log(`   📍 Final URL: ${finalUrl.substring(0, 80)}...`);
    
    // Check if successful
    const pageContent = await page.content();
    const isProxyError = pageContent.includes('proxy server is refusing') || 
                         pageContent.includes('Anonymous Proxy detected') ||
                         pageContent.includes('403 Forbidden');
    
    if (isProxyError) {
      if (pageContent.includes('Anonymous Proxy detected')) {
        console.log(`   ⚠️  PROXY DETECTED (site blocking proxy IPs)`);
        return { name: config.name, success: false, error: 'Anonymous Proxy detected', finalUrl };
      } else {
        console.log(`   ❌ PROXY CONNECTION FAILED`);
        return { name: config.name, success: false, error: 'Proxy refusing connections', finalUrl };
      }
    }
    
    // Check if we reached a final destination
    const isFinal = !finalUrl.includes('effectivegatecpm.com') && 
                   !finalUrl.includes('api/users') &&
                   finalUrl !== 'about:blank' &&
                   !finalUrl.includes('chrome-error');
    
    if (isFinal) {
      console.log(`   ✅ SUCCESS! Reached final destination`);
      return { name: config.name, success: true, finalUrl };
    } else {
      console.log(`   ⚠️  Partial success (still on intermediate URL)`);
      return { name: config.name, success: true, finalUrl };
    }
    
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message.substring(0, 100)}`);
    return { name: config.name, success: false, error: error.message };
  } finally {
    if (page) await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

async function runAllTests() {
  console.log('\n' + '█'.repeat(70));
  console.log('█  FIREFOX DEVICE/CONFIG TESTER');
  console.log('█  Testing multiple configurations to find what works with proxy');
  console.log('█'.repeat(70));
  
  if (!PROXY_PASSWORD) {
    console.error('\n❌ BRIGHTDATA_PASSWORD not set in environment!');
    process.exit(1);
  }
  
  const results: Array<{ name: string; success: boolean; error?: string; finalUrl?: string }> = [];
  
  for (let i = 0; i < FIREFOX_CONFIGS.length; i++) {
    const result = await testConfig(FIREFOX_CONFIGS[i], i);
    results.push(result);
    
    // Small delay between tests
    if (i < FIREFOX_CONFIGS.length - 1) {
      console.log(`\n⏳ Waiting 2s before next test...`);
      await sleep(2000);
    }
  }
  
  // Summary
  console.log('\n\n' + '█'.repeat(70));
  console.log('█  RESULTS SUMMARY');
  console.log('█'.repeat(70));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`\n✅ SUCCESSFUL (${successful.length}):`);
  successful.forEach(r => {
    console.log(`   • ${r.name}`);
    if (r.finalUrl) console.log(`     URL: ${r.finalUrl.substring(0, 60)}...`);
  });
  
  console.log(`\n❌ FAILED (${failed.length}):`);
  failed.forEach(r => {
    console.log(`   • ${r.name}`);
    console.log(`     Error: ${r.error?.substring(0, 60)}...`);
  });
  
  if (successful.length > 0) {
    console.log('\n🎉 RECOMMENDATION: Use configuration from first successful test');
  } else {
    console.log('\n⚠️  All configurations failed. The issue may be:');
    console.log('   1. BrightData proxy doesn\'t fully support Firefox');
    console.log('   2. The target site blocks all proxies regardless of browser');
    console.log('   3. Consider using Chromium or WebKit instead for this site');
  }
}

// Run
runAllTests().catch(console.error);

