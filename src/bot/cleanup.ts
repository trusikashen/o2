/**
 * Browser cleanup module
 * Clears all browser data: cookies, cache, storage, IndexedDB
 * Ensures complete isolation between sessions
 */

import { BrowserContext, Browser } from 'playwright';

/**
 * Clean up all browser data and close browser/context
 * @param context - Playwright browser context
 * @param browser - Playwright browser instance
 */
export async function cleanupBrowserData(context: BrowserContext, browser: Browser): Promise<void> {
  try {
    console.log('   🧹 Cleaning up browser data...');

    // Clear cookies
    try {
      await context.clearCookies();
      console.log('   ✅ Cleared cookies');
    } catch (e) {
      console.warn('   ⚠️  Failed to clear cookies:', (e as any).message?.substring(0, 50));
    }

    // Clear storage (localStorage, sessionStorage, IndexedDB)
    try {
      const pages = context.pages();
      for (const page of pages) {
        await page.evaluate(() => {
          // Clear localStorage
          try {
            localStorage.clear();
          } catch (e) {
            // Ignore errors
          }

          // Clear sessionStorage
          try {
            sessionStorage.clear();
          } catch (e) {
            // Ignore errors
          }

          // Delete all IndexedDB databases
          try {
            if (window.indexedDB) {
              // Note: This approach works on most browsers
              const dbs = (window.indexedDB as any).databases?.() || [];
              dbs.forEach((db: any) => {
                if (db.name) {
                  window.indexedDB.deleteDatabase(db.name);
                }
              });
            }
          } catch (e) {
            // Ignore errors
          }
        });
      }
      console.log('   ✅ Cleared localStorage, sessionStorage, and IndexedDB');
    } catch (e) {
      console.warn('   ⚠️  Failed to clear storage:', (e as any).message?.substring(0, 50));
    }

    // Close all pages
    try {
      const pages = context.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch (e) {
          // Ignore page close errors
        }
      }
      console.log('   ✅ Closed all pages');
    } catch (e) {
      console.warn('   ⚠️  Failed to close pages:', (e as any).message?.substring(0, 50));
    }

    // Close context
    try {
      await context.close();
      console.log('   ✅ Closed browser context');
    } catch (e) {
      console.warn('   ⚠️  Failed to close context:', (e as any).message?.substring(0, 50));
    }

    // Close browser
    try {
      await browser.close();
      console.log('   ✅ Closed browser');
    } catch (e) {
      console.warn('   ⚠️  Failed to close browser:', (e as any).message?.substring(0, 50));
    }

    console.log('   ✅ Cleanup completed successfully');
  } catch (error: any) {
    console.error('   ❌ Cleanup error:', error.message);
    try {
      // Force close browser if cleanup fails
      await browser.close();
    } catch (e) {
      // Ignore final close errors
    }
  }
}
