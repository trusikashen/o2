// @ts-nocheck
/**
 * Test a single bot session
 * Runs one complete session to test the flow
 */

// Load env so BROWSER_HEADLESS from .env is respected
import 'dotenv/config';

import { AdsterraSession } from '../src/bot/session';
import type { AdsterraConfig } from '../../src/types/adsterra';

// Test configuration
// Headless can be overridden via env: BROWSER_HEADLESS=true/false
const browserHeadless = (process.env.BROWSER_HEADLESS ?? 'true').toLowerCase() === 'true';

const testConfig: AdsterraConfig = {
  blogHomepageUrl: 'https://thesportamigo.com/',
  smartLinkText: 'Click here to make money with sport betting',
  totalBots: 1,
  sessionsPerBot: 1,
  targetImpressions: 1,
  browserHeadless, // default true; set BROWSER_HEADLESS=false to see the browser
  minScrollWait: 2000,
  maxScrollWait: 5000,
  minAdWait: 20000,
  maxAdWait: 60000,
  ipRoyalConfig: {
    server: '',
    httpsPort: 0,
    socks5Port: 0,
    username: '',
    password: '',
    apiKey: '',
    orderId: '',
  },
};

async function testSession() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Single Bot Session');
  console.log('='.repeat(60));
  console.log(`\n📋 Configuration:`);
  console.log(`   Blog: ${testConfig.blogHomepageUrl}`);
  console.log(`   Smart Link Text: "${testConfig.smartLinkText}"`);
  console.log(`   Headless: ${testConfig.browserHeadless ? 'Yes' : 'No (Browser will open)'}\n`);

  const session = new AdsterraSession(testConfig);
  
  try {
    const result = await session.execute('test-bot-001', 1);
    
    console.log('\n' + '='.repeat(60));
    if (result.success) {
      console.log('✅ Session completed successfully!');
      console.log(`   Article: ${result.articleUrl}`);
      console.log(`   Duration: ${result.duration ? (result.duration / 1000).toFixed(1) + 's' : 'N/A'}`);
    } else {
      console.log('❌ Session failed!');
      console.log(`   Error: ${result.error}`);
    }
    console.log('='.repeat(60) + '\n');
  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSession();


