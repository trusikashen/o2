/**
 * Inspect CreepJS page structure to find correct selectors
 */

import { chromium, Page } from 'playwright';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function inspectCreepJS() {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 Inspecting CreepJS Page Structure`);
  console.log(`${'='.repeat(80)}\n`);
  
  let browser = null;
  let page: Page | null = null;
  
  try {
    // Launch browser
    browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox'],
    });
    
    const context = await browser.newContext();
    page = await context.newPage();
    
    // Navigate to CreepJS
    console.log(`🌐 Loading CreepJS...`);
    await page.goto('https://abrahamjuliot.github.io/creepjs/', {
      waitUntil: 'networkidle',
      timeout: 60000,
    });
    
    // Wait for analysis
    console.log(`⏳ Waiting for tests (25 seconds)...`);
    await sleep(25000);
    
    // Inspect the page
    console.log(`📄 Analyzing page structure...\n`);
    
    const pageInfo = await page.evaluate(() => {
      const result: any = {
        title: document.title,
        bodyHTML: document.body.innerHTML.substring(0, 2000),
        headings: [],
        textWithScore: [],
        allClasses: new Set<string>(),
        allIds: new Set<string>(),
      };
      
      // Get all headings
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        result.headings.push({
          level: h.tagName,
          text: h.textContent?.substring(0, 100),
          class: h.className,
          id: h.id,
        });
      });
      
      // Get all visible text containing score-like content
      document.querySelectorAll('*').forEach(el => {
        const text = el.textContent || '';
        
        // Collect all classes and IDs
        if (el.className) {
          const classes = el.className.split(' ');
          classes.forEach(c => result.allClasses.add(c));
        }
        if (el.id) {
          result.allIds.add(el.id);
        }
        
        // Find score-like text
        if ((text.includes('lie') || text.includes('score') || text.includes('%')) && 
            text.length > 10 && text.length < 300 &&
            el.offsetHeight > 0) { // visible
          result.textWithScore.push({
            text: text.trim().substring(0, 200),
            tag: el.tagName,
            class: el.className,
            id: el.id,
          });
        }
      });
      
      return {
        ...result,
        allClasses: Array.from(result.allClasses).sort(),
        allIds: Array.from(result.allIds).sort(),
      };
    });
    
    console.log(`📋 PAGE STRUCTURE:\n`);
    console.log(`Title: ${pageInfo.title}\n`);
    
    console.log(`🏷️  All Headings:`);
    pageInfo.headings.forEach((h: any) => {
      console.log(`  ${h.level}: "${h.text}" (class: ${h.class || 'none'}, id: ${h.id || 'none'})`);
    });
    
    console.log(`\n🎯 Text containing 'score', 'lie', or '%':`);
    pageInfo.textWithScore.slice(0, 30).forEach((item: any) => {
      console.log(`  [${item.tag}] class="${item.class}" id="${item.id}"`);
      console.log(`    → ${item.text.substring(0, 150)}`);
    });
    
    console.log(`\n🔧 All CSS Classes (first 50):`);
    pageInfo.allClasses.slice(0, 50).forEach((cls: string) => {
      if (cls.includes('lie') || cls.includes('score') || cls.includes('trust')) {
        console.log(`  ⭐ ${cls}`);
      }
    });
    
    console.log(`\n🔧 All Element IDs (first 50):`);
    pageInfo.allIds.slice(0, 50).forEach((id: string) => {
      if (id.includes('lie') || id.includes('score') || id.includes('trust')) {
        console.log(`  ⭐ ${id}`);
      }
    });
    
    // Keep browser open for manual inspection
    console.log(`\n\n✅ Inspection complete!`);
    console.log(`The browser is open - you can manually inspect the page.`);
    console.log(`Check the developer console (F12) to see element structure.`);
    console.log(`\nClose the browser window to exit...`);
    
  } catch (error) {
    console.error(`❌ Error: ${error}`);
  } finally {
    if (page && browser) {
      // Keep browser open
      await browser.waitForEvent('close');
    }
    if (browser) await browser.close();
  }
}

inspectCreepJS().catch(console.error);
