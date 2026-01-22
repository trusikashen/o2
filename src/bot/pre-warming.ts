/**
 * Pre-warming navigation module
 * Navigates to realistic websites WITHOUT proxy to build natural browsing history
 * Duration: 30-60 seconds total
 */

import { Browser, BrowserContext, Page, Cookie } from 'playwright';
import { sleep, addJitter, randomWithJitter } from '../utils/helpers';

export interface CookieJar {
  cookies: Cookie[];
  timestamp: number;
}

/**
 * Execute pre-warming navigation on realistic websites WITHOUT proxy
 * Builds browsing history, cookies, and creates realistic browsing pattern
 * @param browser - Playwright browser instance
 * @param deviceConfig - Device configuration with viewport and other settings
 * @param warmUpSites - Array of 3-5 websites to navigate
 * @returns CookieJar with collected cookies
 */
export async function executePreWarming(
  browser: Browser,
  deviceConfig: any,
  warmUpSites: string[]
): Promise<CookieJar> {
  // Create context WITHOUT proxy for realistic pre-warming
  const context = await browser.newContext({
    ...deviceConfig,
    // NO proxy config - pre-warming is done on real internet
  });

  const page = await context.newPage();
  const collectedCookies: Cookie[] = [];

  try {
    // Navigate to each warm-up site
    for (const site of warmUpSites) {
      try {
        const url = site.startsWith('http') ? site : `https://${site}`;

        console.log(`   🔥 Pre-warming on: ${url}`);

        // Navigate with realistic timeout
        await page.goto(url, {
          timeout: addJitter(10000),
          waitUntil: 'domcontentloaded',
        });

        // Random delay between 5-10 seconds (realistic browsing)
        const delay = 5000 + Math.random() * 5000;
        await sleep(addJitter(Math.round(delay)));

        // Simulate realistic user interactions
        await simulateRandomScrolls(page, 2 + Math.floor(Math.random() * 3));
        await simulateRandomMouseMoves(page, 3 + Math.floor(Math.random() * 3));

        // Collect cookies from this site
        const siteCookies = await context.cookies();
        collectedCookies.push(...siteCookies);

        console.log(`   ✅ Pre-warmed: ${url} (${Math.round(delay / 1000)}s)`);
      } catch (error: any) {
        // Don't fail entire pre-warming if one site fails
        console.warn(`   ⚠️  Failed to warm-up on ${site}: ${error.message.substring(0, 50)}`);
      }
    }

    console.log(`   ✅ Pre-warming complete: ${warmUpSites.length} sites, ${collectedCookies.length} cookies`);
  } finally {
    await context.close();
  }

  return {
    cookies: collectedCookies,
    timestamp: Date.now(),
  };
}

/**
 * Simulate random scrolls on the page (realistic user behavior)
 * @param page - Playwright page instance
 * @param count - Number of scrolls to perform
 */
async function simulateRandomScrolls(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const scrollY = 100 + Math.random() * 300;
    await page.mouse.wheel(0, scrollY);
    await sleep(addJitter(800 + Math.random() * 1200));
  }
}

/**
 * Simulate random mouse moves on the page (realistic user behavior)
 * @param page - Playwright page instance
 * @param count - Number of moves to perform
 */
async function simulateRandomMouseMoves(page: Page, count: number): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport) return;

  for (let i = 0; i < count; i++) {
    const x = viewport.width * Math.random();
    const y = viewport.height * Math.random();
    // Move with multiple steps for smooth, realistic movement
    await page.mouse.move(x, y, { steps: 10 + Math.floor(Math.random() * 20) });
    await sleep(addJitter(1000 + Math.random() * 2000));
  }
}
