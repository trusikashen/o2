// @ts-nocheck
import { chromium, webkit, Browser, Page, BrowserType } from 'playwright';
import { botConfig, ipRoyalConfig, timingConfig } from '../config';
import { getRandomDevice, getBrowserType, getContextOptionsForDevice, ALL_DEVICES, type BrowserType as DeviceBrowserType, type DeviceConfig } from '../config/devices';
import { ArticleLink, SessionResult } from '../types';
import { random, sleep, addJitter, randomWithJitter } from '../utils/helpers';
import type { AdsterraConfig } from '../types';
import { Semaphore } from '../utils/semaphore';
import { DEVICE_SELECTION } from '../lib/adsterra/distribution-calculator';
import { assessBotRisk } from '../lib/bot-risk-assessment';
// Import realistic session modules
import { executePreWarming } from './pre-warming';
import { simulateRealisticMobileSwipes } from './mobile-interactions';
import { simulateCTR } from './ctr-simulation';
import { cleanupBrowserData } from './cleanup';
// Import advanced anti-detection setup
import { setupBrowserAntiDetection } from './browser-setup';

// Production-level WebKit handling: Limit concurrent WebKit browsers and add longer stagger
// WebKit on Linux with Xvfb + proxy can be resource-intensive and slow
// On Windows with real GUI, these limitations are not needed
const IS_LINUX = process.platform === 'linux';
const MAX_CONCURRENT_WEBKIT = parseInt(process.env.MAX_CONCURRENT_WEBKIT || '4', 10); // Max 2 WebKit browsers at once (Linux only)
const WEBKIT_LAUNCH_STAGGER_MS = parseInt(process.env.WEBKIT_LAUNCH_STAGGER_MS || '10000', 10); // 15 seconds between WebKit launches (Linux only)
const webkitSemaphore = IS_LINUX ? new Semaphore(MAX_CONCURRENT_WEBKIT) : null; // Only create semaphore on Linux
let lastWebKitLaunchTime = 0;
const webkitLaunchMutex = IS_LINUX ? new Semaphore(1) : null; // Only create mutex on Linux

export class AdsterraSession {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private context: any = null; // Playwright BrowserContext
  private config: AdsterraConfig | null;
  private webkitSemaphoreAcquired: boolean = false; // Track if we acquired WebKit semaphore
  private sessionState: 'idle' | 'navigating' | 'final_reached' | 'cleaning' = 'idle';
  private finalUrl: string | null = null;
  private finalReachedPromise: Promise<void> | null = null;
  private finalReachedResolver: (() => void) | null = null;

  constructor(config?: AdsterraConfig | null) {
    this.config = config || null;
  }

  private resetLifecycle() {
    this.sessionState = 'navigating';
    this.finalUrl = null;
    this.finalReachedPromise = new Promise((resolve) => {
      this.finalReachedResolver = resolve;
    });
  }

  private resolveFinalWaiters() {
    if (this.finalReachedResolver) {
      this.finalReachedResolver();
      this.finalReachedResolver = null;
    }
  }

  private markFinalDestination(url: string, reason?: string) {
    if (this.sessionState === 'final_reached') {
      return false;
    }
    this.sessionState = 'final_reached';
    this.finalUrl = url;
    this.resolveFinalWaiters();
    console.log(`   🏁 Final destination committed${reason ? ` (${reason})` : ''}: ${url.substring(0, 100)}`);
    return true;
  }

  private hasFinalDestination() {
    return this.sessionState === 'final_reached' || !!this.finalUrl;
  }

  private async waitWithEarlyExit(ms: number): Promise<void> {
    if (this.hasFinalDestination()) return;
    if (!this.finalReachedPromise) {
      await sleep(ms);
      return;
    }
    await Promise.race([sleep(ms), this.finalReachedPromise]);
  }

  private isFinalDestinationUrl(url: string): boolean {
    if (!url || url === 'about:blank') return false;
    const normalized = url.toLowerCase();
    if (normalized.includes('effectivegatecpm.com') || normalized.includes('api/users')) return false;
    if (normalized.includes('chrome-error') || normalized.includes('automationcontrolled')) return false;

    const strongHints = [
      'chaturbate',
      'adult',
      'porn',
      'dating',
      'click.php',
      '/click?',
      'redirect',
      'offer',
      'preland',
      'lp/',
      '/landing',
      'loveforall',
      'tttracck.com',
      'olnoyep.com',
      'vidox.net',
      'krelox.site',
      'bmdeit4.site',
      'rencontres-voisines',
      'play.google.com',
      'itunes.apple.com',
    ];

    if (strongHints.some((hint) => normalized.includes(hint))) return true;

    // Fallback: any non-Adsterra URL with reasonable length counts as a destination
    return normalized.length > 20;
  }

  private getConfig() {
    if (this.config) {
      // If browserHeadless is explicitly set (true or false), use it
      // If undefined, fall back to env config (which defaults to true if env var is 'true')
      // Important: We explicitly check !== undefined to handle false correctly
      const browserHeadless = this.config.browserHeadless !== undefined 
        ? this.config.browserHeadless 
        : botConfig.browserHeadless;
      
      return {
        adsterraUrl: this.config.adsterraUrl,
        browserHeadless, // Will be false if explicitly set to false, true if set to true, or env default if undefined
        browserTimeout: 30000, // Default timeout
        minScrollWait: this.config.minScrollWait,
        maxScrollWait: this.config.maxScrollWait,
        minAdWait: this.config.minAdWait,
        maxAdWait: this.config.maxAdWait,
      };
    }
    // Fallback to env-based config
    return {
      adsterraUrl: botConfig.adsterraSmartLink, // Use .env configuration as fallback
      browserHeadless: botConfig.browserHeadless,
      browserTimeout: botConfig.browserTimeout,
      minScrollWait: timingConfig.minScrollWait,
      maxScrollWait: timingConfig.maxScrollWait,
      minAdWait: timingConfig.minAdWait,
      maxAdWait: timingConfig.maxAdWait,
    };
  }

  async execute(
    botId: string,
    sessionNumber: number,
    distribution?: { country: string; deviceType: string; deviceName: string; browserType: string },
    job?: any // Full job object with realistic session data
  ): Promise<SessionResult> {
    const startTime = Date.now();
    const config = this.getConfig();
    
    // Extract botIndex from botId (e.g., "bot-00001" → 1, "test-bot-001" → 1)
    let botIndex = 0;
    const indexMatch = botId.match(/(\d+)$/);
    if (indexMatch) {
      botIndex = parseInt(indexMatch[1], 10);
    }
    
    // Priority order for smart link:
    // 1. From job/run config (frontend-provided URL takes precedence)
    // 2. From environment variable (.env fallback)
    let adsterraUrl = config.adsterraUrl || botConfig.adsterraSmartLink;
    
    this.resetLifecycle();
    
    // Extract realistic session data from job (if available)
    const warmUpSites = job?.warmUpSites || [];
    const referrer = job?.referrer || '';
    const sessionSeed = job?.sessionSeed || `${botId}-${sessionNumber}`;
    const ctrEnabled = job?.ctrEnabled || false;
    const swipeCount = job?.swipeCount || 10;
    
    // Ensure URL has https:// protocol (fixes Firefox/Chrome protocol issues)
    if (!adsterraUrl.startsWith('http://') && !adsterraUrl.startsWith('https://')) {
      adsterraUrl = 'https://' + adsterraUrl;
      console.log(`   ⚠️  URL missing protocol, added https://: ${adsterraUrl}`);
    } else if (adsterraUrl.startsWith('http://')) {
      // Force HTTPS for security and compatibility
      adsterraUrl = adsterraUrl.replace('http://', 'https://');
      console.log(`   ⚠️  URL was HTTP, forced to HTTPS: ${adsterraUrl}`);
    }
    
    this.webkitSemaphoreAcquired = false; // Reset for each session

    try {
      // Retry navigation on transient proxy/network failures.
      // This prevents ERR_HTTP_RESPONSE_CODE_FAILURE / timeouts from killing the whole run.
      const NAV_RETRIES = parseInt(process.env.NAV_RETRIES || '2', 10); // 2 retries = 3 total attempts (1 initial + 2 retries)
      const NAV_BACKOFF_MS = parseInt(process.env.NAV_BACKOFF_MS || '1500', 10);
      const MAX_ATTEMPTS = NAV_RETRIES + 1; // Total attempts: 1 initial + NAV_RETRIES retries (with browser fallback)

      const { getProxyServer, getProxyUsername, getProxyPassword, PROXY_PROVIDER } = await import('../config');

      // Rate limiting for BrightData (rate limit removed after adding funds)
      // Limiter is kept for safety but effectively disabled (100k req/min limit)
      if (PROXY_PROVIDER === 'brightdata') {
        const { brightDataRateLimiter } = await import('../utils/rate-limiter');
        await brightDataRateLimiter.waitIfNeeded();
      }

      let lastNavError: any = null;
      
      // Store original distribution for browser fallback
      let originalDeviceName: string | undefined;
      let originalDeviceConfig: DeviceConfig | undefined;
      let originalBrowserType: BrowserType | undefined;
      let originalCountry: string | undefined;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        this.sessionState = this.hasFinalDestination() ? 'final_reached' : 'navigating';
        // Use assigned distribution or randomly select device + browser
        let deviceName: string;
        let deviceConfig: DeviceConfig;
        let browserType: BrowserType;
        let country: string;
        
        if (distribution) {
          // Store original on first attempt
          if (attempt === 1) {
            originalDeviceName = distribution.deviceName;
            originalDeviceConfig = ALL_DEVICES[distribution.deviceName];
            originalBrowserType = distribution.browserType as BrowserType;
            originalCountry = distribution.country;
          }
          
          // Browser fallback strategy: Original → Chrome → Safari (same device)
          if (attempt === 1) {
            // First attempt: Use assigned browser
            deviceName = distribution.deviceName;
            deviceConfig = ALL_DEVICES[deviceName];
            if (!deviceConfig) {
              throw new Error(`Device "${deviceName}" not found in ALL_DEVICES`);
            }
            browserType = distribution.browserType as BrowserType;
            country = distribution.country;
          } else if (attempt === 2) {
            // Second attempt: Switch to Chrome (same device type)
            const deviceType = distribution.deviceType;
            const chromeDevices = DEVICE_SELECTION[deviceType]?.['chromium'] || [];
            if (chromeDevices.length > 0) {
              deviceName = chromeDevices[0]; // Use first Chrome device for this type
              deviceConfig = ALL_DEVICES[deviceName];
              browserType = 'chromium';
              country = originalCountry || distribution.country;
              console.log(`   🔄 Browser fallback: ${originalBrowserType} → Chrome (${deviceName})`);
            } else {
              // No Chrome device available, skip to Safari
              const safariDevices = DEVICE_SELECTION[deviceType]?.['webkit'] || [];
              if (safariDevices.length > 0) {
                deviceName = safariDevices[0];
                deviceConfig = ALL_DEVICES[deviceName];
                browserType = 'webkit';
                country = originalCountry || distribution.country;
                console.log(`   🔄 Browser fallback: ${originalBrowserType} → Safari (${deviceName})`);
              } else {
                // No alternative browser, use original
                deviceName = originalDeviceName!;
                deviceConfig = originalDeviceConfig!;
                browserType = originalBrowserType!;
                country = originalCountry!;
              }
            }
          } else {
            // Third attempt: Switch to Safari (same device type)
            const deviceType = distribution.deviceType;
            const safariDevices = DEVICE_SELECTION[deviceType]?.['webkit'] || [];
            if (safariDevices.length > 0 && originalBrowserType !== 'webkit') {
              deviceName = safariDevices[0];
              deviceConfig = ALL_DEVICES[deviceName];
              browserType = 'webkit';
              country = originalCountry || distribution.country;
              console.log(`   🔄 Browser fallback: ${originalBrowserType} → Safari (${deviceName})`);
            } else {
              // No Safari available or already Safari, use original
              deviceName = originalDeviceName!;
              deviceConfig = originalDeviceConfig!;
              browserType = originalBrowserType!;
              country = originalCountry!;
            }
          }
        } else {
          // Fallback to random selection (for backwards compatibility)
          const randomDevice = getRandomDevice();
          deviceName = randomDevice.deviceName;
          deviceConfig = randomDevice.config;
          browserType = getBrowserType(deviceConfig);
          country = 'us'; // Default to US
        }
        
        // Generate session ID for mobile proxy (fits: 12 chars available)
        // Mobile proxy format: username-session-<12char-id>-country-XX
        const sessionId = `${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 8)}`; // 12 chars max
        const proxyUsername = getProxyUsername(sessionId, country);

        try {
          const countryNames: Record<string, string> = {
            us: 'USA', uk: 'UK', ca: 'Canada', fr: 'France',
            es: 'Spain', ie: 'Ireland', au: 'Australia',
          };
          const browserNames: Record<string, string> = {
            chromium: 'Chrome', firefox: 'Firefox', webkit: 'Safari',
          };
          
          // Verify Xvfb display for headed browsers on Linux
          if (!config.browserHeadless && process.platform === 'linux') {
            const display = process.env.DISPLAY;
            if (display) {
              console.log(`   🖥️  DISPLAY=${display} (Xvfb virtual display detected)`);
            } else {
              console.log(`   ⚠️  WARNING: Headed mode on Linux but no DISPLAY env var! Browsers may fail.`);
            }
          }
          
          console.log(`   🌐 Launching browser (headless: ${config.browserHeadless})...`);
          if (this.config?.browserHeadless !== undefined) {
            console.log(`   📝 Headless setting from run config: ${this.config.browserHeadless}`);
          } else {
            console.log(`   📝 Headless setting from env/default: ${config.browserHeadless}`);
          }
          
          if (!config.browserHeadless) {
            console.log(`   ✅ HEADED MODE: Browser will render visibly (required for Adsterra impressions)`);
          } else {
            console.log(`   ⚠️  HEADLESS MODE: Browser runs without display (impressions may not count on Adsterra)`);
          }
          console.log(`   🌍 Country: ${countryNames[country] || country.toUpperCase()}`);
          console.log(`   📱 Device: ${deviceName} (${deviceConfig.isMobile ? 'Mobile' : deviceConfig.hasTouch ? 'Tablet' : 'Desktop'})`);
          console.log(`   🌐 Browser: ${browserNames[browserType] || browserType.toUpperCase()}`);
          console.log(`   🔌 Using ${PROXY_PROVIDER.toUpperCase()} proxy: ${getProxyServer()}`);
          if (PROXY_PROVIDER === 'brightdata') {
            console.log(`   🆔 Session ID: ${sessionId} (ensures unique IP per bot)`);
            console.log(`   🌍 Proxy Username: ${proxyUsername} (mobile proxy: session + country)`);
            console.log(`   ✅ Each bot gets unique ${countryNames[country] || country.toUpperCase()} mobile IP with sticky session`);
          }

          // RISK ASSESSMENT: Determine if this bot needs pre-warming
          const riskAssessment = assessBotRisk(
            botIndex || 0,
            config,
            undefined, // dailyBotStats - not available here
            {
              daysOld: parseInt(process.env.PROXY_DAYS_OLD || '30', 10),
              isNewProxy: (process.env.PROXY_DAYS_OLD || '30') !== '30',
              reputationScore: 75, // Default good reputation
            },
            {
              browserType: browserType as 'chromium' | 'firefox' | 'webkit',
              platform: process.platform,
            }
          );
          
          console.log(`   🎯 RISK ASSESSMENT: Score ${riskAssessment.riskScore}/100 (${riskAssessment.isRisky ? '⚠️  RISKY' : '✅ SAFE'})`);
          console.log(`   💡 Recommendation: ${riskAssessment.recommendation}`);
          
          // CRITICAL WARNING: WebKit on Linux
          if (browserType === 'webkit' && process.platform === 'linux') {
            console.log(`   `);
            console.log(`   ${'═'.repeat(80)}`);
            console.log(`   🔴 CRITICAL BOT SIGNATURE DETECTED!`);
            console.log(`   🔴 WebKit (Safari) on Linux = 100% detectable bot signature`);
            console.log(`   🔴 Safari only exists on macOS and iOS`);
            console.log(`   🔴 Anti-fraud will ALWAYS block this`);
            console.log(`   `);
            console.log(`   ✅ SOLUTION: Use Chromium instead!`);
            console.log(`   ✅ Change browserType to 'chromium'`);
            console.log(`   ${'═'.repeat(80)}`);
            console.log(`   `);
          }
          
          // Log individual risk factors
          for (const factor of riskAssessment.factors) {
            const riskIcon = factor.score > 60 ? '🔴' : factor.score > 40 ? '🟡' : '🟢';
            console.log(`      ${riskIcon} ${factor.name}: ${factor.score}/100 (${factor.reason})`);
          }

          // Production-level WebKit handling: Limit concurrent WebKit and add longer stagger (Linux only)
          // On Windows with real GUI, WebKit performs well without these limitations
          if (browserType === 'webkit' && IS_LINUX) {
            // Acquire WebKit semaphore to limit concurrent WebKit browsers (Linux only)
            if (webkitSemaphore) {
              await webkitSemaphore.acquire();
              this.webkitSemaphoreAcquired = true;
              console.log(`   🍎 WebKit: Acquired semaphore (max ${MAX_CONCURRENT_WEBKIT} concurrent)`);
            }
            
            // Stagger WebKit launches more aggressively (Linux only)
            if (webkitLaunchMutex) {
              await webkitLaunchMutex.acquire();
              const now = Date.now();
              const timeSinceLastWebKit = now - lastWebKitLaunchTime;
              if (timeSinceLastWebKit < WEBKIT_LAUNCH_STAGGER_MS && lastWebKitLaunchTime > 0) {
                const waitTime = WEBKIT_LAUNCH_STAGGER_MS - timeSinceLastWebKit;
                console.log(`   ⏳ WebKit: Waiting ${(waitTime/1000).toFixed(1)}s since last WebKit launch (stagger: ${WEBKIT_LAUNCH_STAGGER_MS}ms)...`);
                await sleep(waitTime);
              }
              lastWebKitLaunchTime = Date.now();
              webkitLaunchMutex.release();
            }
          } else if (browserType === 'webkit' && !IS_LINUX) {
            // Windows: No semaphore or stagger needed - WebKit works well with real GUI
            console.log(`   🍎 WebKit: Running on Windows - no concurrency limits (real GUI)`);
          }

          // Launch browser based on device type (chromium or webkit only - Firefox removed due to proxy issues)
          const browserLauncher = browserType === 'webkit' ? webkit : chromium;
          
          // Browser launch args (different per browser type)
          // NOTE: WebKit does NOT support command-line args like Chromium/Firefox
          const chromiumArgs = [
              '--no-sandbox',
              '--disable-setuid-sandbox',
              '--disable-webrtc', // Prevent IP leaks
              '--disable-blink-features=WebRTC,AutomationControlled',
              '--disable-dev-shm-usage',
              '--ignore-certificate-errors',
              '--ignore-certificate-errors-spki-list',
              '--ignore-ssl-errors',
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

          // NOTE: Firefox support removed due to proxy compatibility issues with BrightData
          // Only Chromium and WebKit are supported now
          // WebKit doesn't support command-line args
          
          // ============================================================================
          // 🎯 SMART 8-STAGE REALISTIC SESSION FLOW WITH RISK-BASED PRE-WARMING
          // ============================================================================
          
          // DECISION: Do pre-warming only for risky bots (save proxy traffic for safe bots)
          const shouldDoPreWarming = riskAssessment.isRisky;
          
          if (shouldDoPreWarming) {
            console.log(`   🔴 HIGH RISK BOT: Will do pre-warming (${riskAssessment.riskScore}/100)`);
          } else {
            console.log(`   🟢 SAFE BOT: Skipping pre-warming to save proxy traffic (${riskAssessment.riskScore}/100)`);
          }
          
          // STAGE 1: Launch browser (pre-warming stage, only for risky bots)
          if (shouldDoPreWarming) {
            console.log(`   🔥 STAGE 1: Launching browser for pre-warming (WITHOUT proxy)...`);
          } else {
            console.log(`   ⏭️  STAGE 1: Skipping pre-warming (low-risk bot)...`);
          }
          
          const browserWithoutProxyOptions: any = {
            headless: config.browserHeadless,
            // NO proxy config here - pre-warming is on real internet
            ...(browserType === 'chromium' ? { args: chromiumArgs } : {}),
          };
          
          // Launch the browser
          try {
            this.browser = await browserLauncher.launch(browserWithoutProxyOptions);
            console.log(`   ✅ Browser launched (${browserType})`);
          } catch (launchError: any) {
            console.error(`   ❌ Failed to launch browser: ${launchError.message}`);
            throw launchError;
          }
          
          // STAGE 2: Create context WITH proxy FIRST (before any navigation)
          console.log(`   🔗 STAGE 2: Creating proxy context (collecting cookies WITH proxy)...`);
          const countryMap: Record<string, 'US' | 'UK' | 'FR'> = {
            us: 'US',
            uk: 'UK',
            fr: 'FR',
            ca: 'US',
            es: 'FR',
            ie: 'UK',
            au: 'US',
          };
          const countryCode = countryMap[country.toLowerCase()] || 'US';
          
          const contextOptions = getContextOptionsForDevice(deviceConfig, countryCode);
          
          const contextStart = Date.now();
          this.context = await this.browser.newContext({
            ...contextOptions,
            ignoreHTTPSErrors: true,
            proxy: {
              server: getProxyServer(),
              username: proxyUsername,
              password: getProxyPassword(),
            },
          });
          
          const contextTime = Date.now() - contextStart;
          console.log(`   🔌 Proxy: ${getProxyServer()} | Context created in ${contextTime}ms`);

          // STAGE 3: Do pre-warming WITH proxy (only for risky bots)
          console.log(`   🔥 STAGE 3: Pre-warming (${shouldDoPreWarming ? 'WITH proxy' : 'SKIPPED (safe bot)'})`);
          if (shouldDoPreWarming && warmUpSites && warmUpSites.length > 0) {
            try {
              const prewarmPage = await this.context.newPage();
              try {
                // Navigate to each warm-up site WITH proxy so cookies have correct IP geo
                for (const site of warmUpSites) {
                  try {
                    const url = site.startsWith('http') ? site : `https://${site}`;
                    console.log(`   🔥 Pre-warming on: ${url} (with proxy IP)`);
                    
                    await prewarmPage.goto(url, {
                      timeout: addJitter(10000),
                      waitUntil: 'domcontentloaded',
                    });

                    const delay = 5000 + Math.random() * 5000;
                    await sleep(addJitter(Math.round(delay)));
                    
                    console.log(`   ✅ Pre-warmed: ${url}`);
                  } catch (siteError: any) {
                    console.warn(`   ⚠️  Failed to warm-up on ${site}: ${siteError.message?.substring(0, 50)}`);
                  }
                }
              } finally {
                await prewarmPage.close();
              }
              console.log(`   ✅ Pre-warming complete (cookies collected with proxy IP)`);
            } catch (warmupError: any) {
              console.warn(`   ⚠️  Pre-warming with proxy failed: ${warmupError.message}`);
            }
          } else if (!shouldDoPreWarming) {
            console.log(`   ⏭️  STAGE 3: Skipped pre-warming (low-risk bot - saving proxy traffic)`);
            
            // Add small delay anyway to avoid detection (traffic should not be too instant)
            const minDelay = 2000;
            const maxDelay = 5000;
            const delayMs = minDelay + Math.random() * (maxDelay - minDelay);
            console.log(`   ⏳ Adding ${(delayMs/1000).toFixed(1)}s delay before SmartLink click...`);
            await sleep(delayMs);
          } else {
            console.log(`   ⏭️  STAGE 3: No warm-up sites available...`);
          }

          // Create page
          const pageCreationTimeout = addJitter(browserType === 'webkit' ? 60000 : 30000);
          
          let pageCreationAttempts = 0;
          const maxPageCreationAttempts = 3;
          let pageCreated = false;
          const pageCreationStart = Date.now();
          
          while (!pageCreated && pageCreationAttempts < maxPageCreationAttempts) {
            pageCreationAttempts++;
            if (pageCreationAttempts > 1) {
              console.log(`   🔁 Retrying page creation (attempt ${pageCreationAttempts}/${maxPageCreationAttempts})...`);
              await sleep(addJitter(2000));
            }
            
            try {
              this.page = await Promise.race([
                this.context.newPage(),
                new Promise((_, reject) => 
                  setTimeout(() => reject(new Error(`Page creation timeout after ${pageCreationTimeout/1000}s`)), pageCreationTimeout)
                )
              ]) as Page;
              pageCreated = true;
            } catch (pageError: any) {
              if (pageCreationAttempts >= maxPageCreationAttempts) {
                console.error(`   ❌ Page creation failed after ${maxPageCreationAttempts} attempts: ${pageError.message}`);
                throw pageError;
              }
              console.log(`   ⚠️  Page creation attempt ${pageCreationAttempts} failed: ${pageError.message}, retrying...`);
            }
          }
          
          const pageCreationTime = Date.now() - pageCreationStart;
          this.page.setDefaultTimeout(config.browserTimeout);
          console.log(`   📄 Page created in ${pageCreationTime}ms`);

          // 🛡️ STAGE 4: Apply advanced anti-detection measures
          console.log(`   🛡️  STAGE 4: Applying advanced anti-detection setup...`);
          try {
            await setupBrowserAntiDetection(this.page, deviceConfig, botId);
          } catch (setupError: any) {
            console.warn(`   ⚠️  Anti-detection setup failed (non-critical): ${setupError.message?.substring(0, 100)}`);
          }

          // Detect final destination ASAP
          this.page.on('framenavigated', (frame) => {
            try {
              if (!this.page) return;
              if (frame !== this.page.mainFrame()) return;
              const url = frame.url();
              if (this.isFinalDestinationUrl(url)) {
                this.markFinalDestination(url, 'navigation event');
              }
            } catch (e) {
              // Ignore navigation detection errors
            }
          });
          
          // Handle new tabs/pages that might open (close them to avoid confusion)
          this.context.on('page', async (newPage) => {
            // If a new page opens and it's not our main page, close it after a short delay
            if (newPage !== this.page) {
              // Give it a moment to see if it's a redirect
              setTimeout(async () => {
                try {
                  const newPageUrl = newPage.url();
                  // If it's an empty tab or automationcontrolled, close it
                  if (newPageUrl === 'about:blank' || newPageUrl.includes('automationcontrolled') || newPageUrl === '') {
                    await newPage.close();
                  } else {
                    // If it's a valid URL, switch to it (might be the actual redirect)
                    this.page = newPage;
                  }
                } catch (e) {
                  // Ignore errors when checking/closing
                }
              }, addJitter(2000));
            }
          });

      // STEP 1: Set up resource blocking to minimize data usage (target: <0.5 MB per session)
      let totalBytesDownloaded = 0;
      let blockedCount = 0;
      const finalizeSuccess = async (reason?: string): Promise<SessionResult> => {
        // Ensure final state is committed once
        if (!this.hasFinalDestination() && this.page) {
          const finalUrl = this.page.url();
          if (this.isFinalDestinationUrl(finalUrl)) {
            this.markFinalDestination(finalUrl, 'finalize');
          }
        }
        const dataUsedMB = (totalBytesDownloaded / (1024 * 1024)).toFixed(2);
        const duration = Date.now() - startTime;
        this.sessionState = 'final_reached';
        await this.cleanup();
        console.log(`   ✅ Session complete: ${(duration / 1000).toFixed(1)}s | Data: ${dataUsedMB}MB | Blocked: ${blockedCount}${reason ? ` | ${reason}` : ''}\n`);

        return {
          success: true,
          botId,
          sessionNumber,
          articleUrl: adsterraUrl, // Use Adsterra URL
          duration,
          timestamp: new Date(),
        };
      };
      
      await this.page.route('**/*', (route) => {
        const request = route.request();
        const url = request.url();
        const resourceType = request.resourceType();
        
        // Block images (40-60% bandwidth savings)
        if (resourceType === 'image') {
          blockedCount++;
          route.abort();
          return;
        }
        
        // Block fonts (5-10% savings)
        if (resourceType === 'font') {
          blockedCount++;
          route.abort();
          return;
        }
        
        // Block videos/media (5-10% savings)
        if (resourceType === 'media' || 
            url.includes('.mp4') || 
            url.includes('.webm') || 
            url.includes('.avi') ||
            url.includes('.mov')) {
          blockedCount++;
          route.abort();
          return;
        }
        
        // Block analytics & tracking (15-20% savings)
        const analyticsDomains = [
          'google-analytics.com',
          'googletagmanager.com',
          'analytics.google.com',
          'facebook.net',
          'facebook.com/tr',
          'twitter.com/i/adsct',
          'hotjar.com',
          'mixpanel.com',
          'segment.com',
          'amplitude.com',
          'heap.io',
          'fullstory.com',
          'mouseflow.com',
        ];
        
        if (analyticsDomains.some(domain => url.includes(domain))) {
          blockedCount++;
          route.abort();
          return;
        }
        
        // Block social media widgets
        if (url.includes('facebook.com/plugins') ||
            url.includes('twitter.com/widgets') ||
            url.includes('instagram.com/embed')) {
          blockedCount++;
          route.abort();
          return;
        }
        
        // Allow everything else (HTML, CSS, JS needed for functionality)
        route.continue();
      });
      
      // Track data usage accurately
      // Use content-length header which represents actual bytes transferred (compressed)
      // This matches what proxy providers like BrightData measure
      this.page.on('response', (response) => {
        try {
          const headers = response.headers();
          
          // Use content-length header (this is the actual compressed bytes transferred)
          const contentLength = headers['content-length'];
          if (contentLength) {
            const size = parseInt(contentLength, 10);
            if (!isNaN(size) && size > 0) {
              totalBytesDownloaded += size;
            }
          }
          
          // For responses without content-length, estimate from content-encoding
          // But only if we can't get content-length (most responses have it)
          // Note: We don't count response bodies directly as they're uncompressed
          // and would inflate our numbers
        } catch (e) {
          // Ignore tracking errors
        }
      });
      
      // Track request body size (POST data)
      this.page.on('request', (request) => {
        try {
          const postData = request.postData();
          if (postData) {
            // Count actual bytes of POST data
            totalBytesDownloaded += Buffer.byteLength(postData, 'utf8');
          }
        } catch (e) {
          // Ignore errors in request tracking
        }
      });

      // STEP 2: Inject stealth scripts to avoid detection
      // Inject enhanced stealth scripts to hide automation (device-aware)
      // Capture device info in closure
      const isMobileDevice = deviceConfig.isMobile;
      const deviceBrowserType = browserType;
      const deviceUserAgent = deviceConfig.userAgent;
      
      await this.page.addInitScript(() => {
        // Variables captured from closure
        const isMobile = isMobileDevice;
        const browserType = deviceBrowserType;
        const userAgent = deviceUserAgent;
        
        // Hide webdriver property (all devices)
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // Override chrome object (only for Chromium-based browsers, not mobile Safari/Firefox)
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
          // Mobile devices: plugins should be empty or minimal
          Object.defineProperty(navigator, 'plugins', {
            get: () => [],
          });
        }

        // Override languages (match device locale)
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });

        // Override platform to match user agent
        let platform = 'Win32'; // Default
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
        const cores = isMobile ? 6 : 8; // Mobile devices typically have fewer cores
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          get: () => cores,
        });

        // Override deviceMemory (device-appropriate)
        const memory = isMobile ? 4 : 8; // Mobile devices typically have less RAM
        Object.defineProperty(navigator, 'deviceMemory', {
          get: () => memory,
        });

        // Override connection (prevent WebRTC leaks, mobile-appropriate)
        Object.defineProperty(navigator, 'connection', {
          get: () => ({
            effectiveType: isMobile ? '4g' : 'wifi',
            rtt: isMobile ? 100 : 50,
            downlink: isMobile ? 10 : 50,
            saveData: false,
          }),
        });

        // Hide proxy detection indicators
        // Override getClientRects to prevent fingerprinting
        const originalGetClientRects = Element.prototype.getClientRects;
        Element.prototype.getClientRects = function() {
          const rects = originalGetClientRects.apply(this, arguments);
          // Return normal rects to avoid detection
          return rects;
        };

        // Override getBoundingClientRect similarly
        const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function() {
          return originalGetBoundingClientRect.apply(this, arguments);
        };

        // Override screen properties to match device
        Object.defineProperty(screen, 'availWidth', {
          get: () => isMobile ? 375 : 1920,
        });
        Object.defineProperty(screen, 'availHeight', {
          get: () => isMobile ? 667 : 1080,
        });
        Object.defineProperty(screen, 'width', {
          get: () => isMobile ? 375 : 1920,
        });
        Object.defineProperty(screen, 'height', {
          get: () => isMobile ? 667 : 1080,
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

      // CRITICAL: Wait for browser/proxy connection to establish (+ jitter to prevent detection)
      // These are minimum wait times - proven to work from test-page-readiness.ts
      // Chromium needs 10s, WebKit needs 5s for proxy connection
      const browserInitDelay = addJitter(browserType === 'chromium' ? 10000 : 5000);
      console.log(`   ⏳ Waiting ${(browserInitDelay/1000).toFixed(1)}s for ${browserType} proxy connection to establish...`);
      await this.waitWithEarlyExit(browserInitDelay);
      
      // Page readiness check - verify browser context is ready before navigation (+ jitter)
      // Max 120 seconds - better to wait longer than fail prematurely
      const MAX_PAGE_READY_WAIT = addJitter(120000);
      console.log(`   🔍 Checking page readiness (max ${(MAX_PAGE_READY_WAIT/1000).toFixed(1)}s)...`);
      let readyChecks = 0;
      const maxReadyChecks = 3;
      const readyCheckStart = Date.now();
      while (readyChecks < maxReadyChecks && Date.now() - readyCheckStart < MAX_PAGE_READY_WAIT) {
        try {
          const currentUrl = this.page.url();
          // Check for error states
          if (currentUrl.includes('chrome-error') || currentUrl.includes('error')) {
            await sleep(addJitter(1000));
            continue;
          }
          // Verify page context is responsive
          await this.page.evaluate(() => true);
          readyChecks++;
          if (readyChecks >= 3) {
            const elapsed = Math.floor((Date.now() - readyCheckStart) / 1000);
            console.log(`   ✅ Browser/proxy connection ready after ${elapsed}s!`);
            break;
          }
        } catch (e) {
          // Page not ready yet
        }
        // Log progress every 10 seconds
        const elapsed = Math.floor((Date.now() - readyCheckStart) / 1000);
        if (elapsed > 0 && elapsed % 10 === 0) {
          console.log(`   ⏳ Waiting for page readiness... (${elapsed}s elapsed, ${readyChecks}/${maxReadyChecks} checks)`);
        }
        await sleep(addJitter(1000));
      }
      if (readyChecks < 3) {
        const elapsed = Math.floor((Date.now() - readyCheckStart) / 1000);
        console.log(`   ⚠️  Page readiness check incomplete after ${elapsed}s (${readyChecks}/3), proceeding anyway...`);
      }

      // STEP 3: Navigate to Adsterra Smart Link URL
      console.log(`   🚀 Navigating to: ${adsterraUrl}`);
      
      // Track redirects and responses to see the full chain
      const redirectChain: string[] = [];
      let redirectCount = 0;
      let firstResponseCode: number | null = null;
      let finalResponseCode: number | null = null;
      
      this.page.on('response', (response) => {
        const url = response.url();
        const status = response.status();
        
        // Track first response code
        if (firstResponseCode === null && url.includes('effectivegatecpm.com')) {
          firstResponseCode = status;
        }
        
        // Track final response code
        if (url.includes('effectivegatecpm.com') || url.includes('api/users')) {
          finalResponseCode = status;
        }
        
        // Track all redirects (3xx) and important URLs
        if (status >= 300 && status < 400) {
          redirectCount++;
          const redirectUrl = url.length > 100 ? url.substring(0, 100) + '...' : url;
          redirectChain.push(`${status} -> ${redirectUrl}`);
          console.log(`   🔄 Redirect #${redirectCount}: ${status} → ${redirectUrl}`);
        } else if ((status >= 200 && status < 300) && (url.includes('effectivegatecpm.com') || url.includes('api/users'))) {
          redirectChain.push(`${status} ${url.substring(0, 80)}`);
        }
      });
      
      // Handle navigation with better error handling for redirects
      try {
        // STAGE 6: Referrer simulation (navigate to referrer URL first)
        if (referrer) {
          console.log(`   🔗 STAGE 6: Simulating referrer navigation...`);
          try {
            console.log(`   ⏳ Navigating to referrer: ${referrer.substring(0, 80)}...`);
            await this.page.goto(referrer, {
              timeout: addJitter(5000),
              waitUntil: 'domcontentloaded',
            });
            console.log(`   ✅ Referrer page loaded`);
            
            // Random delay on referrer page (1-2s + jitter)
            const referrerDelay = randomWithJitter(1000, 2000);
            await this.waitWithEarlyExit(referrerDelay);
          } catch (referrerError: any) {
            console.warn(`   ⚠️  Referrer navigation failed: ${referrerError.message.substring(0, 50)}, continuing...`);
            // Continue anyway - referrer is nice-to-have
          }
        } else {
          console.log(`   ⏭️  STAGE 6: Skipping referrer (not configured)...`);
        }
        
        // STAGE 7: Navigate to smartlink
        console.log(`   🎯 STAGE 7: Navigating to smartlink...`);
        const navStart = Date.now();
        
        // Ensure URL is HTTPS before navigation (critical for proxy compatibility)
        const navigationUrl = adsterraUrl.startsWith('https://') ? adsterraUrl : `https://${adsterraUrl.replace(/^https?:\/\//, '')}`;
        if (navigationUrl !== adsterraUrl) {
          console.log(`   ⚠️  URL protocol corrected: ${adsterraUrl} → ${navigationUrl}`);
        }
        
        // Browser-specific navigation settings (+ jitter) - proven to work from test-page-readiness.ts
        // Chromium: 'load' with longer timeout (handles redirects better)
        // WebKit: 'domcontentloaded' with shorter timeout (faster)
        // Max 120s timeout - better to wait than fail
        const navWaitUntil = browserType === 'chromium' ? 'load' : 'domcontentloaded';
        const navTimeout = addJitter(120000); // 120s max for both browsers (+ jitter)
        
        console.log(`   ⏳ Navigating with waitUntil: ${navWaitUntil}, timeout: ${(navTimeout/1000).toFixed(1)}s...`);
        let response;
        try {
          response = await this.page.goto(navigationUrl, {
            waitUntil: navWaitUntil as 'load' | 'domcontentloaded',
            timeout: navTimeout,
            referer: referrer || undefined, // Include referrer in request headers
          });
        } catch (navError: any) {
          // Handle ERR_HTTP_RESPONSE_CODE_FAILURE - page might still have navigated despite error
          // This happens with 502/503 errors where proxy returns error but page still loads
          if (navError.message.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') || 
              navError.message.includes('net::ERR') ||
              navError.message.includes('Navigation failed')) {
            console.log(`   ⚠️  Navigation error (${navError.message.substring(0, 80)}), checking if page still loaded...`);
            const currentUrl = this.page.url();
            if (currentUrl !== 'about:blank' && 
                !currentUrl.includes('chrome-error') && 
                !currentUrl.includes('automationcontrolled')) {
              console.log(`   ✅ Page still navigated to: ${currentUrl.substring(0, 80)}...`);
              // Continue - page loaded despite error
              response = null; // Will check URL instead of response status
            } else {
              // Still on error page, re-throw
              throw navError;
            }
          } else {
            throw navError; // Re-throw other errors
          }
        }
        
        const navTime = Date.now() - navStart;
        const responseStatus = response?.status() || 'N/A';
        console.log(`   📡 Navigation completed in ${navTime}ms | Response: ${responseStatus}${firstResponseCode && firstResponseCode !== responseStatus ? ` (first: ${firstResponseCode})` : ''}`);
        
        // CRITICAL: 5xx errors (502, 503, 504, 500, 501) mean the page didn't load - throw to trigger retry
        // But only if we have a response - if response is null, we already handled the error above
        if (response && response.status() >= 500) {
          // Check if we're actually on a valid URL despite the error
          const currentUrl = this.page.url();
          const isValidUrl = currentUrl !== 'about:blank' && 
                            !currentUrl.includes('chrome-error') &&
                            !currentUrl.includes('automationcontrolled');
          
          if (isValidUrl) {
            console.log(`   ⚠️  HTTP ${response.status()} response, but page is on valid URL - continuing...`);
          } else {
            const errorMsg = `HTTP ${response.status()} error - page did not load (will retry with browser fallback)`;
            console.error(`   ❌ ${errorMsg}`);
            throw new Error(errorMsg);
          }
        }
        
        // 4xx errors (except 404) might be retryable, but let's be conservative
        if (response && response.status() >= 400 && response.status() < 500) {
          // 404 is usually not retryable, but others might be
          if (response.status() !== 404) {
            console.log(`   ⚠️  HTTP ${response.status()} response detected, but continuing...`);
          } else {
            throw new Error(`HTTP 404 - page not found (will retry)`);
          }
        }
        
        // Wait for network to settle (all redirects complete + jitter)
        // Max 60s for network idle (120s would be too long for this specific check)
        const networkIdleTimeout = addJitter(60000);
        console.log(`   ⏳ Waiting for network to settle (max ${(networkIdleTimeout/1000).toFixed(1)}s)...`);
        try {
          await this.page.waitForLoadState('networkidle', { timeout: networkIdleTimeout });
          console.log(`   ✅ Network idle - redirects should be complete`);
        } catch (e) {
          console.log(`   ⚠️  Network not idle after ${(networkIdleTimeout/1000).toFixed(1)}s, continuing...`);
        }
        
        // Additional wait for JavaScript redirects and page scripts (+ jitter)
        // Chromium needs more time for JS redirects
        const jsWaitTime = addJitter(browserType === 'chromium' ? 5000 : 3000);
        console.log(`   ⏳ Waiting ${(jsWaitTime/1000).toFixed(1)}s for JavaScript redirects...`);
        await this.waitWithEarlyExit(jsWaitTime);
        
        // Check if URL changed after wait (JavaScript redirects)
        const urlAfterWait = this.page.url();
        if (urlAfterWait !== navigationUrl && !urlAfterWait.includes('effectivegatecpm.com')) {
          console.log(`   🔄 JavaScript redirect detected: ${urlAfterWait.substring(0, 100)}`);
        }
        
        const finalUrl = this.page.url();
        
        // Handle "automationcontrolled/" issue (happens with Firefox/Chrome)
        // This is a browser quirk where it tries to handle the automation flag incorrectly
        if (finalUrl.includes('automationcontrolled')) {
          console.log(`   ❌ Browser stuck on automationcontrolled protocol`);
          console.log(`   🦊 This is a known ${deviceBrowserType} issue - failing gracefully`);
          
          // Don't try to recover - just fail and move on to prevent blocking
          throw new Error(`Navigation failed - stuck on automationcontrolled protocol (${deviceBrowserType} issue)`);
        }
        
        const actualFinalUrl = this.page.url();

        // Log current status (but don't count as impression yet - wait for final destination)
        if (this.isFinalDestinationUrl(actualFinalUrl)) {
          this.markFinalDestination(actualFinalUrl, 'post-navigation check');
          console.log(`   ✅ Final destination reached: ${actualFinalUrl.substring(0, 100)}`);
        } else if (actualFinalUrl.includes('api/users')) {
          console.log(`   ⚠️  On Adsterra API endpoint (waiting for redirect to final destination...)`);
        } else if (actualFinalUrl.includes('effectivegatecpm.com')) {
          console.log(`   ⚠️  Still on Adsterra domain (waiting for redirect to final destination...)`);
        } else {
          console.log(`   ⚠️  Current URL: ${actualFinalUrl.substring(0, 100)} (waiting for final destination...)`);
        }
        
        // Log redirect chain summary
        if (redirectCount > 0) {
          console.log(`   📊 Redirects: ${redirectCount} | Chain: ${redirectChain.slice(0, 3).join(' → ')}${redirectChain.length > 3 ? '...' : ''}`);
        } else if (finalResponseCode) {
          console.log(`   📊 No redirects | Final response: ${finalResponseCode}`);
        }
        
        // Check if proxy was detected or 502 error
        try {
          const pageText = await this.page.textContent('body') || '';
          
          // Check for 502 Proxy Error - Throw to trigger retry
          if (pageText.includes('502 Unexpected Status') || pageText.includes('Error code: 502') || pageText.includes('no_peer')) {
            throw new Error('Proxy Error: 502 Unexpected Status (no_peer) - will retry');
          }

          // CRITICAL: If proxy is detected, throw error to trigger browser retry
          // Proxy detection means impression won't count - must retry with different browser
          if (pageText.includes('Anonymous Proxy') || pageText.includes('proxy detected') ||
              pageText.includes('VPN detected') || pageText.includes('bot detected')) {
            const errorMsg = `Proxy/automation detected in page content - impression will not count (will retry with browser fallback)`;
            console.error(`   ❌ ${errorMsg}`);
            throw new Error(errorMsg);
          }
        } catch (textError: any) {
          // Re-throw proxy errors to trigger retry
          if (textError.message && textError.message.includes('Proxy Error')) {
            throw textError;
          }
          console.log(`   ℹ️  Could not check page text (redirected away)`);
        }
      } catch (navError: any) {
        const currentUrl = this.page.url();
        
        // Only continue if we're on a valid URL (not about:blank or error pages)
        // AND the URL is actually related to Adsterra or the ad destination
        const isValidUrl = currentUrl !== 'about:blank' && 
                          !currentUrl.includes('chrome-error') &&
                          (currentUrl.includes('effectivegatecpm.com') || 
                           currentUrl.includes('api/users') ||
                           currentUrl.includes('chaturbate') ||
                           currentUrl.includes('adult') ||
                           currentUrl.includes('porn') ||
                           currentUrl.includes('dating'));
        
        if (isValidUrl) {
          console.log(`   ⚠️  Navigation error, but page is at: ${currentUrl.substring(0, 100)}...`);
          console.log(`   ℹ️  Valid URL detected - impression may still count`);
          
          // Check if we actually reached the ad despite the error
          if (currentUrl.includes('chaturbate') || currentUrl.includes('adult')) {
            console.log(`   🎉 SUCCESS: Reached ad destination despite navigation error!`);
          }
        } else {
          // Still on about:blank or error page - navigation definitely failed
          console.error(`   ❌ Navigation failed - still on invalid URL: ${currentUrl}`);
          throw navError;
        }
      }

      // STEP 4: Wait for final destination (the ad page) - ONLY count impression when we reach it
      // This is critical: Adsterra only counts impressions when the user reaches the final ad destination
      // We must wait dynamically until we reach the final destination, not just wait a fixed time
      
      // Additional redirect wait time (+ jitter to prevent detection) - proven to work from test-page-readiness.ts
      // Chromium needs more time for final redirects than WebKit
      const additionalRedirectWait = addJitter(browserType === 'chromium' ? 15000 : 10000);
      console.log(`   ⏳ Waiting ${(additionalRedirectWait/1000).toFixed(1)}s for final redirects to complete...`);
      await this.waitWithEarlyExit(additionalRedirectWait);
      
      console.log(`   ⏱️  Checking final destination (ad page)...`);
      
      const MAX_WAIT_FOR_FINAL_DESTINATION = addJitter(120000); // Max 120 seconds to reach final destination (+ jitter)
      const POLL_INTERVAL = addJitter(1000); // Check every 1 second (+ jitter)
      const startWaitTime = Date.now();
      let reachedFinalDestination = false;
      let currentUrl = this.page.url();
      // Throttle verbose polling logs to avoid stdout backpressure (ENOBUFS)
      const WAIT_LOG_INTERVAL = parseInt(process.env.FINAL_WAIT_LOG_INTERVAL || '30', 10); // seconds
      let lastWaitLog = -WAIT_LOG_INTERVAL;
      let lastWaitUrl = currentUrl;
      
      // Check initial URL (might already be on final destination)
      if (this.isFinalDestinationUrl(currentUrl)) {
        reachedFinalDestination = true;
        this.markFinalDestination(currentUrl, 'already on final destination');
        console.log(`   ✅ Already on final destination: ${currentUrl.substring(0, 100)}`);
      } else {
        // Poll until we reach final destination or timeout
        console.log(`   🔄 Polling for final destination (max ${MAX_WAIT_FOR_FINAL_DESTINATION/1000}s)...`);
        while (Date.now() - startWaitTime < MAX_WAIT_FOR_FINAL_DESTINATION) {
          await this.waitWithEarlyExit(POLL_INTERVAL);
          
          try {
            currentUrl = this.page.url();
            
            // Check for JavaScript redirects (page might have navigated)
            if (this.isFinalDestinationUrl(currentUrl)) {
              reachedFinalDestination = true;
              this.markFinalDestination(currentUrl, 'polled');
              const elapsed = Math.floor((Date.now() - startWaitTime) / 1000);
              console.log(`   ✅ Final destination reached after ${elapsed}s: ${currentUrl.substring(0, 100)}`);
              break;
            }
            
            // Log progress every 5 seconds
            const elapsed = Math.floor((Date.now() - startWaitTime) / 1000);
            const urlChanged = currentUrl !== lastWaitUrl;
            if ((elapsed - lastWaitLog >= WAIT_LOG_INTERVAL || urlChanged) && elapsed > 0) {
              console.log(`   ⏳ Still waiting for final destination... (${elapsed}s elapsed, current: ${currentUrl.substring(0, 80)})`);
              lastWaitLog = elapsed;
              lastWaitUrl = currentUrl;
            }
          } catch (e) {
            // Page might have navigated away, continue checking
            const elapsed = Math.floor((Date.now() - startWaitTime) / 1000);
            if (elapsed - lastWaitLog >= WAIT_LOG_INTERVAL && elapsed > 0) {
              console.log(`   ⏳ Page may have navigated, continuing to check... (${elapsed}s elapsed)`);
              lastWaitLog = elapsed;
            }
          }
        }
      }

      // If an event-based detector already marked final, honor it even if polling loop didn't catch it
      if (!reachedFinalDestination && this.hasFinalDestination() && this.finalUrl) {
        reachedFinalDestination = true;
        currentUrl = this.finalUrl;
        console.log(`   ✅ Final destination previously committed: ${currentUrl.substring(0, 100)}`);
      }
      
      // If we didn't reach final destination, this impression won't count - fail the session
      if (!reachedFinalDestination) {
        const elapsed = Math.floor((Date.now() - startWaitTime) / 1000);
        console.error(`   ❌ Failed to reach final destination within ${elapsed}s`);
        console.error(`   📍 Final URL: ${currentUrl.substring(0, 100)}`);
        console.error(`   ⚠️  This impression will NOT count on Adsterra - session failed`);
        throw new Error(`Did not reach final ad destination - impression will not count. Final URL: ${currentUrl.substring(0, 100)}`);
      }
      
      // STAGE 8A: Mobile interactions (swipes, taps) - only for ~55% of sessions
      if (swipeCount > 0) {
        console.log(`   📱 STAGE 8A: Executing mobile interactions (${swipeCount} swipes)...`);
        try {
          if (deviceConfig.isMobile && this.page.viewportSize()) {
            await simulateRealisticMobileSwipes(
              this.page,
              this.page.viewportSize()!,
              sessionSeed,
              swipeCount,
              swipeCount
            );
          } else {
            console.log(`   ℹ️  Skipping mobile swipes (not mobile device)`);
          }
        } catch (e) {
          console.warn(`   ⚠️  Mobile interactions failed: ${(e as any).message?.substring(0, 50)}`);
        }
      } else {
        console.log(`   ⏭️  STAGE 8A: Skipping interactions (45% no-interaction pattern)`);
      }
      
      // STAGE 8B: CTR simulation (optional ad click) - 5-20s
      if (ctrEnabled && Math.random() < 0.5) { // 50% of enabled sessions actually do it
        console.log(`   🎯 STAGE 8B: CTR simulation enabled...`);
        try {
          if (this.page.viewportSize()) {
            await simulateCTR(this.page, this.page.viewportSize()!, 1.0);
          }
        } catch (e) {
          console.warn(`   ⚠️  CTR simulation failed: ${(e as any).message?.substring(0, 50)}`);
        }
      } else if (ctrEnabled) {
        console.log(`   ⏭️  STAGE 8B: Skipping CTR (random chance)`);
      } else {
        console.log(`   ⏭️  STAGE 8B: CTR not enabled for this session`);
      }
      
      // STAGE 8C: Wait for impression to register (+ jitter to prevent detection)
      // If no interactions: wait 8-15s (just viewing)
      // If interactions: wait 15-30s (realistic engagement time)
      const hasInteractions = swipeCount > 0;
      let minWait: number;
      let maxWait: number;
      
      if (!hasInteractions) {
        // No interactions: shorter wait (just viewing page)
        minWait = randomWithJitter(12000, 16000);
        maxWait = randomWithJitter(18000, 25000);
      } else {
        // With interactions: normal wait time
        minWait = randomWithJitter(Math.max(10000, config.minAdWait || 10000), Math.max(10000, config.minAdWait || 10000) + 4900);
        maxWait = randomWithJitter(Math.min(30000, config.maxAdWait || 30000), Math.min(30000, config.maxAdWait || 30000) + 4900);
      }
      
      const waitTime = randomWithJitter(Math.min(minWait, maxWait), Math.max(minWait, maxWait));
      console.log(`   ⏳ STAGE 8C: Waiting ${(waitTime / 1000).toFixed(1)}s for impression to register...`);
      await sleep(waitTime);
      
      // STAGE 8D: Cleanup and finalize
      console.log(`   🧹 STAGE 8D: Cleanup and finalization...`);
      return await finalizeSuccess();
        } catch (attemptError: any) {
          lastNavError = attemptError;

          if (this.hasFinalDestination()) {
            console.log(`   ✅ Final destination already committed, skipping further retries.`);
            return await finalizeSuccess('final committed - stop retries');
          }

          const msg = String(attemptError?.message || attemptError);
          const retryable =
            msg.includes('ERR_HTTP_RESPONSE_CODE_FAILURE') ||
            msg.includes('501') || // Not Implemented
            msg.includes('502') || // Bad Gateway
            msg.includes('503') || // Service Unavailable
            msg.includes('504') || // Gateway Timeout
            msg.includes('500') || // Internal Server Error
            msg.includes('no_peer') ||
            msg.includes('Timeout') ||
            msg.includes('net::ERR_TIMED_OUT') ||
            msg.includes('net::ERR_CONNECTION') ||
            msg.includes('net::ERR_PROXY') ||
            msg.includes('Navigation') ||
            msg.includes('Target page, context or browser has been closed') ||
            msg.includes('Proxy/automation detected') || // Proxy detection - retry with different browser
            msg.includes('Did not reach final ad destination'); // CRITICAL: Retry if final destination not reached

          // Clean up browser/context for next attempt (new IP)
          await this.cleanup();

          if (!retryable || attempt === MAX_ATTEMPTS) {
            throw attemptError;
          }

          const backoff = addJitter(NAV_BACKOFF_MS * attempt);
          console.log(`   🔁 Navigation failed (attempt ${attempt}/${MAX_ATTEMPTS}). Retrying in ${(backoff / 1000).toFixed(1)}s...`);
          await sleep(backoff);
        }
      }

      // If we somehow exit loop without returning, throw last error
      throw lastNavError || new Error('Navigation failed');
    } catch (error: any) {
      if (this.hasFinalDestination()) {
        console.log(`   ✅ Final destination was already committed; finishing session despite late error.`);
        await this.cleanup();
        const duration = Date.now() - startTime;
        return {
          success: true,
          botId,
          sessionNumber,
          articleUrl: adsterraUrl,
          duration,
          timestamp: new Date(),
        };
      }
      console.error(`   ❌ Error: ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n')[1]?.trim()}`);
      }
      await this.cleanup();

      return {
        success: false,
        botId,
        sessionNumber,
        articleUrl: adsterraUrl, // Use Adsterra URL
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  private async findArticles(): Promise<ArticleLink[]> {
    if (!this.page) throw new Error('Page not initialized');

    // Try multiple selectors to find article links
    const articleSelectors = [
      'article a',
      '.post a',
      '.blog-post a',
      '.article-link',
      '.entry-title a',
      'h2 a',
      'h3 a',
      '.post-title a',
    ];

    for (const selector of articleSelectors) {
      try {
        const links = await this.page.$$eval(selector, (elements) => {
          return elements
            .map((el) => ({
              href: (el as HTMLAnchorElement).href,
              text: el.textContent?.trim() || '',
            }))
            .filter(
              (link) =>
                link.href &&
                !link.href.includes('#') &&
                link.text.length > 0 &&
                link.href.startsWith('http')
            );
        });

        if (links.length > 0) {
          // Remove duplicates
          const uniqueLinks = Array.from(
            new Map(links.map((link) => [link.href, link])).values()
          );
          return uniqueLinks;
        }
      } catch (e) {
        // Try next selector
        continue;
      }
    }

    return [];
  }

  private async clickSmartLink(smartLinkText: string): Promise<boolean> {
    if (!this.page) throw new Error('Page not initialized');

    // Multiple strategies to find Smart Link
    const smartLinkSelectors = [
      // Href contains effectivegatecpm.com (Adsterra Smart Link domain)
      'a[href*="effectivegatecpm.com"]',
      // Exact text match
      `text="${smartLinkText}"`,
      // Partial text match (case insensitive)
      `text=/Click here to make money/i`,
      // Href contains adsterra
      'a[href*="adsterra"]',
      // Any link with "make money" in text
      'a:has-text("make money")',
      // Any link with "sport betting" in text
      'a:has-text("sport betting")',
    ];

    for (const selector of smartLinkSelectors) {
      try {
        const link = this.page.locator(selector).first();
        
        // Wait for link to be attached to DOM (+ jitter)
        await link.waitFor({ state: 'attached', timeout: addJitter(3000) });
        
        // Check if link is visible (+ jitter)
        const isVisible = await link.isVisible({ timeout: addJitter(2000) }).catch(() => false);
        if (!isVisible) {
          // Scroll to link only if not visible
          console.log(`   📍 Scrolling to Smart Link...`);
          await link.scrollIntoViewIfNeeded({ timeout: addJitter(5000) });
          await sleep(addJitter(1000));
        }
        
        // Get link details for logging
        const linkHref = await link.getAttribute('href');
        const linkText = await link.textContent();
        console.log(`   🔍 Found Smart Link:`);
        console.log(`      Text: "${linkText?.trim()}"`);
        console.log(`      URL: ${linkHref}`);
        
        // Wait a bit before clicking (human-like delay + jitter to prevent detection)
        await sleep(randomWithJitter(500, 1500));

        // Check if link opens in new tab (target="_blank")
        const target = await link.getAttribute('target');
        const opensInNewTab = target === '_blank' || target === '_new';
        
        if (opensInNewTab) {
          console.log(`   📌 Link opens in new tab, waiting for popup...`);
          
          // Get current context and page count
          const context = this.page.context();
          const pagesBefore = context.pages().length;
          
          // Wait for new page/tab to open BEFORE clicking (+ jitter)
          const pagePromise = context.waitForEvent('page', { timeout: addJitter(15000) });
          
          // Click the link
          await link.click({ force: true, timeout: addJitter(5000) });
          
          try {
            const newPage = await pagePromise;
            console.log(`   ✅ New tab opened!`);
            // Switch to the new page
            this.page = newPage;
            
            // Wait for page to load with longer timeout and better error handling
            try {
              await this.page.waitForLoadState('domcontentloaded', { timeout: addJitter(30000) });
              
              // Check if page loaded successfully (not an error page)
              const currentUrl = this.page.url();
              if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:blank')) {
                console.log(`   ⚠️  Page didn't load properly, waiting longer...`);
                await sleep(addJitter(3000));
                
                // Try waiting for network idle
                try {
                  await this.page.waitForLoadState('networkidle', { timeout: addJitter(20000) });
                } catch (e) {
                  // If networkidle fails, check URL again
                  const finalUrl = this.page.url();
                  if (finalUrl.startsWith('chrome-error://')) {
                    throw new Error(`Page failed to load: ${finalUrl}`);
                  }
                }
              }
              
              // Verify final URL is valid
              const finalUrl = this.page.url();
              if (!finalUrl.startsWith('chrome-error://') && !finalUrl.startsWith('about:blank')) {
                console.log(`   ✅ Page loaded successfully: ${finalUrl.substring(0, 80)}...`);
                // Store the successful URL for later reference
                (this.page as any)._adsterraUrl = finalUrl;
                return true;
              } else {
                throw new Error(`Page loaded with error URL: ${finalUrl}`);
              }
            } catch (loadError: any) {
              // Check if page eventually loaded
              await sleep(addJitter(2000));
              const checkUrl = this.page.url();
              if (!checkUrl.startsWith('chrome-error://') && !checkUrl.startsWith('about:blank')) {
                console.log(`   ✅ Page loaded after retry: ${checkUrl.substring(0, 80)}...`);
                return true;
              }
              throw loadError;
            }
          } catch (e) {
            // Check if new page was created anyway
            const pagesAfter = context.pages();
            if (pagesAfter.length > pagesBefore) {
              console.log(`   ✅ New tab found (${pagesAfter.length} tabs now)`);
              this.page = pagesAfter[pagesAfter.length - 1];
              
              // Wait for load with retry
              try {
                await this.page.waitForLoadState('domcontentloaded', { timeout: addJitter(30000) });
                const checkUrl = this.page.url();
                if (!checkUrl.startsWith('chrome-error://') && !checkUrl.startsWith('about:blank')) {
                  console.log(`   ✅ Page loaded: ${checkUrl.substring(0, 80)}...`);
                  return true;
                }
              } catch (loadError) {
                await sleep(addJitter(3000));
                const finalCheck = this.page.url();
                if (!finalCheck.startsWith('chrome-error://') && !finalCheck.startsWith('about:blank')) {
                  console.log(`   ✅ Page loaded after wait: ${finalCheck.substring(0, 80)}...`);
                  return true;
                }
              }
            }
            console.log(`   ⚠️  New tab didn't open properly, trying same-tab navigation...`);
            // Fall through to same-tab click
          }
        }
        
        // Click the link (will navigate in same tab or if new tab failed)
        console.log(`   🖱️  Clicking Smart Link...`);
        await link.click({ force: true, timeout: addJitter(5000) });
        console.log(`   ✅ Smart Link clicked using selector: ${selector}`);
        return true;
        
      } catch (e: any) {
        // Log error but continue to next selector
        if (!e.message.includes('timeout') && !e.message.includes('not found')) {
          console.log(`   ⚠️  Selector ${selector} failed: ${e.message}`);
        }
        continue;
      }
    }

    return false;
  }

  private async clickPrivacyButtons(): Promise<void> {
    if (!this.page) return;

    // Common privacy policy/cookie consent button selectors
    const privacyButtonSelectors = [
      'button:has-text("Accept")',
      'button:has-text("Accept All")',
      'button:has-text("I Accept")',
      'button:has-text("Agree")',
      'button:has-text("OK")',
      'button:has-text("Got it")',
      'button:has-text("Allow")',
      'button:has-text("Allow All")',
      'button[id*="accept"]',
      'button[class*="accept"]',
      'button[id*="cookie"]',
      'button[class*="cookie"]',
      'button[id*="consent"]',
      'button[class*="consent"]',
      'a:has-text("Accept")',
      'a:has-text("I Accept")',
      '.cookie-consent button',
      '#cookie-consent button',
      '[id*="cookie-banner"] button',
      '[class*="cookie-banner"] button',
      '[id*="privacy-banner"] button',
      '[class*="privacy-banner"] button',
      // Add more specific selectors
      'button[aria-label*="Accept"]',
      'button[aria-label*="Cookie"]',
      '[role="button"]:has-text("Accept")',
    ];

    for (const selector of privacyButtonSelectors) {
      try {
        const button = this.page.locator(selector).first();
        
        // Wait for button to be attached to DOM (+ jitter)
        await button.waitFor({ state: 'attached', timeout: addJitter(3000) }).catch(() => null);
        
        // Check if visible (+ jitter)
        const isVisible = await button.isVisible({ timeout: addJitter(2000) }).catch(() => false);
        
        if (isVisible) {
          // Scroll into view if needed
          await button.scrollIntoViewIfNeeded({ timeout: addJitter(2000) }).catch(() => null);
          await sleep(addJitter(500)); // Wait for scroll
          
          // Get button info for logging
          const buttonText = await button.textContent().catch(() => '');
          const buttonId = await button.getAttribute('id').catch(() => '');
          const buttonClass = await button.getAttribute('class').catch(() => '');
          
          console.log(`   🍪 Found privacy/cookie button:`);
          console.log(`      Text: "${buttonText?.trim()}"`);
          console.log(`      ID: ${buttonId || 'none'}`);
          console.log(`      Class: ${buttonClass?.substring(0, 50) || 'none'}...`);
          console.log(`      Clicking...`);
          
          // Try multiple click methods
          try {
            // Method 1: Regular click
            await button.click({ timeout: addJitter(3000), force: true });
            console.log(`   ✅ Clicked privacy button (method: regular click)`);
          } catch (clickError: any) {
            // Method 2: JavaScript click
            try {
              await button.evaluate((el: HTMLElement) => el.click());
              console.log(`   ✅ Clicked privacy button (method: JavaScript click)`);
            } catch (jsError: any) {
              // Method 3: Dispatch click event
              await button.dispatchEvent('click');
              console.log(`   ✅ Clicked privacy button (method: dispatch event)`);
            }
          }
          
          await sleep(addJitter(2000)); // Wait for popunder to trigger
          console.log(`   ✅ Privacy button clicked (popunder should have triggered)`);
          return; // Only click one button
        }
      } catch (e: any) {
        // Try next selector
        if (!e.message.includes('timeout') && !e.message.includes('not found')) {
          // Only log non-timeout errors
          continue;
        }
        continue;
      }
    }
    
    console.log(`   ℹ️  No privacy button found (this is okay)`);
  }

  private async cleanup(): Promise<void> {
    try {
      this.sessionState = 'cleaning';
      
      // Use comprehensive cleanup module
      if (this.context && this.browser) {
        try {
          await cleanupBrowserData(this.context, this.browser);
        } catch (e) {
          console.error('Cleanup module error:', (e as any).message?.substring(0, 100));
          // Fallback to manual cleanup
          try {
            if (this.page) {
              await this.page.close();
            }
            if (this.context) {
              await this.context.close();
            }
            if (this.browser) {
              await this.browser.close();
            }
          } catch (fallbackErr) {
            console.error('Fallback cleanup error:', fallbackErr);
          }
        }
      } else {
        // Fallback if context/browser not properly initialized
        if (this.page) {
          await this.page.close();
          this.page = null;
        }
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
      }
      
      this.page = null;
      this.context = null;
      this.browser = null;
      
      // Release WebKit semaphore if we acquired it (Linux only)
      if (this.webkitSemaphoreAcquired && webkitSemaphore) {
        webkitSemaphore.release();
        this.webkitSemaphoreAcquired = false;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Ensure WebKit semaphore is released even on error (Linux only)
      if (this.webkitSemaphoreAcquired && webkitSemaphore) {
        try {
          webkitSemaphore.release();
          this.webkitSemaphoreAcquired = false;
        } catch (e) {
          // Ignore release errors
        }
      }
    }
  }
}
