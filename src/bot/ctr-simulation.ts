/**
 * CTR (Click-Through Rate) simulation module
 * Simulates occasional ad clicks for realistic behavior
 * Duration: 5-20 seconds when triggered
 */

import { Page } from 'playwright';
import { sleep, addJitter } from '../utils/helpers';

/**
 * Simulate a click-through event (ad click) on the page
 * @param page - Playwright page instance
 * @param viewport - Viewport dimensions
 * @param ctrRate - Probability of simulating CTR (0-1, default 0.05 = 5%)
 * @returns boolean - true if CTR was simulated, false otherwise
 */
export async function simulateCTR(
  page: Page,
  viewport: { width: number; height: number },
  ctrRate: number = 0.05
): Promise<boolean> {
  // Check if we should simulate CTR
  if (Math.random() > ctrRate) {
    return false;
  }

  console.log('   🎯 Simulating CTR (ad click)...');

  // Attempt to find and click an ad element
  const adSelectors = [
    '[data-ad="true"]',
    '.ad-container',
    '.advertisement',
    'iframe[src*="ads"]',
    '[class*="ad-"]',
    '[id*="ad-"]',
  ];

  let adElement = null;
  for (const selector of adSelectors) {
    try {
      adElement = await page.$(selector);
      if (adElement) {
        console.log(`   ✅ Found ad element with selector: ${selector}`);
        break;
      }
    } catch (e) {
      // Selector error, try next
      continue;
    }
  }

  try {
    if (adElement) {
      // Click the ad element
      await adElement.click();
      console.log(`   ✅ Clicked ad element`);
    } else {
      // No ad found, click random area (simulating clicking perceived ad)
      const x = viewport.width * (0.3 + Math.random() * 0.4);
      const y = viewport.height * (0.3 + Math.random() * 0.4);
      console.log(`   ✅ Clicking area at (${Math.round(x)}, ${Math.round(y)}) (perceived ad)`);
      await page.mouse.click(x, y);
    }
  } catch (e) {
    console.warn(`   ⚠️  Ad click failed (likely page navigation):`, (e as any).message?.substring(0, 50));
  }

  // Wait for potential navigation
  await sleep(addJitter(3000 + Math.random() * 7000));

  // Simulate additional interactions on the new page/ad
  await simulateRandomScrolls(page, 1 + Math.floor(Math.random() * 3));

  // 50% chance to go back to previous page
  if (Math.random() < 0.5) {
    try {
      console.log(`   ↩️  Going back to previous page`);
      await page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {
        // goBack might fail if no history
      });
      await sleep(addJitter(2000 + Math.random() * 3000));
    } catch (e) {
      // Ignore goBack errors
    }
  }

  console.log('   ✅ CTR simulation complete');
  return true;
}

/**
 * Simulate random scrolls (helper function)
 * @param page - Playwright page instance
 * @param count - Number of scrolls
 */
async function simulateRandomScrolls(page: Page, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const scrollAmount = 100 + Math.random() * 300;
    await page.mouse.wheel(0, scrollAmount);
    await sleep(addJitter(500 + Math.random() * 1500));
  }
}
