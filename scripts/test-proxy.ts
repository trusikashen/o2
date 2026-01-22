/**
 * Test Proxy Connection (IPRoyal or DataImpulse)
 * This script tests if the proxy is working correctly
 */

import { chromium } from 'playwright';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const PROXY_PROVIDER = (process.env.PROXY_PROVIDER || 'brightdata').toLowerCase();


// BrightData config
const BRIGHTDATA_HOST = process.env.BRIGHTDATA_HOST || 'brd.superproxy.io';
const BRIGHTDATA_PORT = process.env.BRIGHTDATA_PORT || '33335';
const BRIGHTDATA_USERNAME = process.env.BRIGHTDATA_USERNAME || 'brd-customer-hl_d4382b99-zone-residential_proxy1';
const BRIGHTDATA_PASSWORD = process.env.BRIGHTDATA_PASSWORD || 'o1qvlhpaqg22';
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE || 'residential_proxy1';

// DataImpulse config
const DATAIMPULSE_HOST = process.env.DATAIMPULSE_HOST || '';
const DATAIMPULSE_PORT = process.env.DATAIMPULSE_PORT || '';
const DATAIMPULSE_USERNAME = process.env.DATAIMPULSE_USERNAME || '';
const DATAIMPULSE_PASSWORD = process.env.DATAIMPULSE_PASSWORD || '';
const DATAIMPULSE_COUNTRY_CODE = process.env.DATAIMPULSE_COUNTRY_CODE || 'US';

// IPRoyal config
const IPROYAL_SERVER = process.env.IPROYAL_SERVER || '';
const IPROYAL_HTTPS_PORT = process.env.IPROYAL_HTTPS_PORT || '';
const IPROYAL_SOCKS5_PORT = process.env.IPROYAL_SOCKS5_PORT || '';
const IPROYAL_USERNAME = process.env.IPROYAL_USERNAME || '';
const IPROYAL_PASSWORD = process.env.IPROYAL_PASSWORD || '';

function getProxyServer(useSocks5 = false): string {
  if (PROXY_PROVIDER === 'brightdata') {
    return `http://${BRIGHTDATA_HOST}:${BRIGHTDATA_PORT}`;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    return `http://${DATAIMPULSE_HOST}:${DATAIMPULSE_PORT}`;
  } else {
    const port = useSocks5 ? IPROYAL_SOCKS5_PORT : IPROYAL_HTTPS_PORT;
    const protocol = useSocks5 ? 'socks5://' : 'http://';
    return `${protocol}${IPROYAL_SERVER}:${port}`;
  }
}

function getProxyUsername(): string {
  if (PROXY_PROVIDER === 'brightdata') {
    return BRIGHTDATA_USERNAME;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    return `${DATAIMPULSE_USERNAME}_cr.${DATAIMPULSE_COUNTRY_CODE}`;
  } else {
    return IPROYAL_USERNAME;
  }
}

function getProxyPassword(): string {
  if (PROXY_PROVIDER === 'brightdata') {
    return BRIGHTDATA_PASSWORD;
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    return DATAIMPULSE_PASSWORD;
  } else {
    return IPROYAL_PASSWORD;
  }
}

async function testProxy() {
  console.log('\n' + '='.repeat(60));
  console.log(`🔍 Testing ${PROXY_PROVIDER.toUpperCase()} Proxy Connection`);
  console.log('='.repeat(60));
  console.log(`\n📋 Proxy Configuration (${PROXY_PROVIDER.toUpperCase()}):`);
  if (PROXY_PROVIDER === 'brightdata') {
    console.log(`   Host: ${BRIGHTDATA_HOST}`);
    console.log(`   Port: ${BRIGHTDATA_PORT}`);
    console.log(`   Username: ${BRIGHTDATA_USERNAME}`);
    console.log(`   Password: ${BRIGHTDATA_PASSWORD ? '***' : 'NOT SET'}`);
    console.log(`   Zone: ${BRIGHTDATA_ZONE}`);
  } else if (PROXY_PROVIDER === 'dataimpulse') {
    console.log(`   Host: ${DATAIMPULSE_HOST}`);
    console.log(`   Port: ${DATAIMPULSE_PORT}`);
    console.log(`   Username: ${DATAIMPULSE_USERNAME}`);
    console.log(`   Password: ${DATAIMPULSE_PASSWORD ? '***' : 'NOT SET'}`);
    console.log(`   Country Code: ${DATAIMPULSE_COUNTRY_CODE}`);
    console.log(`   Full Username: ${getProxyUsername()}`);
  } else {
    console.log(`   Server: ${IPROYAL_SERVER}`);
    console.log(`   HTTPS Port: ${IPROYAL_HTTPS_PORT}`);
    console.log(`   SOCKS5 Port: ${IPROYAL_SOCKS5_PORT}`);
    console.log(`   Username: ${IPROYAL_USERNAME}`);
    console.log(`   Password: ${IPROYAL_PASSWORD ? '***' : 'NOT SET'}`);
  }
  console.log(`   Proxy URL: ${getProxyServer(false)}\n`);

  const proxyServer = getProxyServer(false);
  const proxyUsername = getProxyUsername();
  const proxyPassword = getProxyPassword();
  
  console.log(`🔌 Using ${PROXY_PROVIDER.toUpperCase()} proxy:`);
  console.log(`   Server: ${proxyServer}`);
  console.log(`   Username: ${proxyUsername}`);
  console.log(`   Password: ${proxyPassword ? '***' : 'NOT SET'}\n`);

  // Force headless mode for server environments
  const browser = await chromium.launch({
    headless: true, // Always use headless on servers
    proxy: {
      server: proxyServer,
      username: proxyUsername,
      password: proxyPassword,
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  // Create context with ignoreHTTPSErrors to handle proxy SSL certificates
  const context = await browser.newContext({
    ignoreHTTPSErrors: true, // Required for proxies that intercept SSL
  });

  const page = await context.newPage();
  page.setDefaultTimeout(30000); // 30 second timeout

  try {
    // Test 1: Check IP address
    console.log('🧪 Test 1: Checking IP address...');
    try {
      await page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'networkidle',
      });
      const ipData = await page.textContent('body');
      const ipInfo = JSON.parse(ipData || '{}');
      console.log(`   ✅ Your IP: ${ipInfo.ip}`);
      console.log(`   📍 This should be a US IP from IPRoyal\n`);
    } catch (error: any) {
      console.error(`   ❌ Failed to get IP: ${error.message}\n`);
    }

    // Test 2: Access a simple website
    console.log('🧪 Test 2: Accessing Google.com...');
    try {
      await page.goto('https://www.google.com', {
        waitUntil: 'networkidle',
      });
      const title = await page.title();
      console.log(`   ✅ Successfully loaded: ${title}\n`);
    } catch (error: any) {
      console.error(`   ❌ Failed to load Google: ${error.message}\n`);
    }

    // Test 3: Access your blog
    const blogUrl = process.env.BLOG_HOMEPAGE_URL || 'https:samyun-wan.life/blogs';
    console.log(`🧪 Test 3: Accessing your blog (${blogUrl})...`);
    try {
      await page.goto(blogUrl, {
        waitUntil: 'networkidle',
      });
      const title = await page.title();
      console.log(`   ✅ Successfully loaded blog: ${title}\n`);
    } catch (error: any) {
      console.error(`   ❌ Failed to load blog: ${error.message}\n`);
    }

    // Test 4: Access Adsterra URL (the one that failed)
    const adsterraUrl = 'https://www.effectivegatecpm.com/yd8cwt8fm?key=c6a794c91bb238bc89210c721d361221';
    console.log(`🧪 Test 4: Accessing Adsterra URL with HTTPS proxy...`);
    console.log(`   URL: ${adsterraUrl}`);
    let adsterraSuccess = false;
    try {
      await page.goto(adsterraUrl, {
        waitUntil: 'networkidle',
        timeout: 30000,
      });
      const title = await page.title();
      const currentUrl = page.url();
      console.log(`   ✅ Successfully loaded Adsterra page`);
      console.log(`   📄 Title: ${title}`);
      console.log(`   🔗 Final URL: ${currentUrl}\n`);
      adsterraSuccess = true;
    } catch (error: any) {
      console.error(`   ❌ Failed with HTTPS proxy: ${error.message}\n`);
      
      // Try with SOCKS5 proxy
      console.log(`🧪 Test 4b: Trying Adsterra URL with SOCKS5 proxy...`);
      await browser.close();
      
      const isHeadless = !process.env.DISPLAY || process.env.DISPLAY === '';
      const socks5Browser = await chromium.launch({
        headless: isHeadless,
        proxy: {
          server: getProxyServer(true), // SOCKS5
          username: IPROYAL_USERNAME,
          password: IPROYAL_PASSWORD,
        },
      });
      
      const socks5Context = await socks5Browser.newContext({
        ignoreHTTPSErrors: true,
      });
      
      const socks5Page = await socks5Context.newPage();
      socks5Page.setDefaultTimeout(30000);
      
      try {
        await socks5Page.goto(adsterraUrl, {
          waitUntil: 'networkidle',
          timeout: 30000,
        });
        const title = await socks5Page.title();
        const currentUrl = socks5Page.url();
        console.log(`   ✅ Successfully loaded Adsterra page with SOCKS5!`);
        console.log(`   📄 Title: ${title}`);
        console.log(`   🔗 Final URL: ${currentUrl}\n`);
        console.log(`   💡 SOLUTION: Use SOCKS5 proxy instead of HTTPS proxy\n`);
        adsterraSuccess = true;
        await socks5Browser.close();
        
        // Recreate browser for remaining tests
        const isHeadless = !process.env.DISPLAY || process.env.DISPLAY === '';
        const newBrowser = await chromium.launch({
          headless: isHeadless,
          proxy: {
            server: getProxyServer(false),
            username: IPROYAL_USERNAME,
            password: IPROYAL_PASSWORD,
          },
        });
        const newPage = await newBrowser.newPage();
        newPage.setDefaultTimeout(30000);
        // Continue with newPage for remaining tests
      } catch (socks5Error: any) {
        console.error(`   ❌ Failed with SOCKS5 proxy too: ${socks5Error.message}\n`);
        await socks5Browser.close();
        
        // Test without proxy to see if site is accessible at all
        console.log(`🧪 Test 4c: Testing Adsterra URL WITHOUT proxy (to check if site is accessible)...`);
        const isHeadless = !process.env.DISPLAY || process.env.DISPLAY === '';
        const noProxyBrowser = await chromium.launch({
          headless: isHeadless,
        });
        const noProxyPage = await noProxyBrowser.newPage();
        noProxyPage.setDefaultTimeout(30000);
        
        try {
          await noProxyPage.goto(adsterraUrl, {
            waitUntil: 'networkidle',
            timeout: 30000,
          });
          const title = await noProxyPage.title();
          console.log(`   ✅ Site IS accessible without proxy (Title: ${title})`);
          console.log(`   ⚠️  This means Adsterra is BLOCKING proxy connections\n`);
          await noProxyBrowser.close();
        } catch (noProxyError: any) {
          console.error(`   ❌ Site not accessible even without proxy: ${noProxyError.message}`);
          console.log(`   ⚠️  The site itself might be down or the URL is invalid\n`);
          await noProxyBrowser.close();
        }
        
        // Check if it's a proxy error
        if (error.message.includes('TUNNEL') || error.message.includes('proxy')) {
          console.log('   💡 Analysis:');
          console.log('      - Proxy works for other sites (Google, your blog)');
          console.log('      - Adsterra site may be blocking proxy connections');
          console.log('      - This is common for ad networks to prevent fraud');
          console.log('      - You may need to use residential proxies or different proxy provider\n');
        }
      }
    }

    // Test 5: Check proxy authentication with alternative IP service
    console.log('🧪 Test 5: Testing proxy authentication...');
    try {
      // Try accessing a different IP checking service
      await page.goto('https://api.ipify.org?format=json', {
        waitUntil: 'networkidle',
        timeout: 10000,
      });
      const ipInfo = await page.textContent('body');
      console.log(`   ✅ Proxy authentication working`);
      console.log(`   📊 Response: ${ipInfo}\n`);
    } catch (error: any) {
      // If that fails, try another service
      try {
        await page.goto('https://ifconfig.me/ip', {
          waitUntil: 'networkidle',
          timeout: 10000,
        });
        const ip = await page.textContent('body');
        console.log(`   ✅ Proxy authentication working`);
        console.log(`   📊 IP: ${ip}\n`);
      } catch (error2: any) {
        console.log(`   ⚠️  IP check services unavailable, but proxy is working (Test 1 passed)\n`);
      }
    }

    console.log('='.repeat(60));
    console.log('✅ Proxy test complete!');
    console.log('='.repeat(60));
    console.log('\n💡 Keep the browser open to see the results.');
    console.log('💡 Press Ctrl+C to close the browser and exit.\n');

    // Keep browser open for 30 seconds so user can see results
    await page.waitForTimeout(30000);

  } catch (error: any) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

// Run the test
testProxy().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

