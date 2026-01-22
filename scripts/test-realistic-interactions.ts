/**
 * Test Realistic Interactions Distribution
 * 
 * Shows the distribution of swipeCount:
 * - 45% no interactions (swipeCount = 0)
 * - 55% 1-6 interactions (swipeCount = 1-6)
 * 
 * Run: npm run test:interactions
 */

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function simulateJobCreation(jobCount: number) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 TESTING REALISTIC INTERACTIONS DISTRIBUTION`);
  console.log(`Creating ${jobCount} jobs...`);
  console.log(`${'='.repeat(80)}\n`);

  const stats = {
    zeroInteractions: 0,
    oneToSix: 0,
    distribution: new Map<number, number>(),
  };

  // Simulate the EXACT logic from create-jobs.ts
  for (let i = 0; i < jobCount; i++) {
    // This is the EXACT logic we just changed:
    const interactionRoll = Math.random();
    const swipeCount = interactionRoll < 0.45 
      ? 0 
      : 1 + Math.floor(Math.random() * 6); // 1-6 swipes for 55%

    if (swipeCount === 0) {
      stats.zeroInteractions++;
    } else {
      stats.oneToSix++;
    }

    // Track distribution
    const count = stats.distribution.get(swipeCount) || 0;
    stats.distribution.set(swipeCount, count + 1);
  }

  // Display results
  console.log(`📈 RESULTS (${jobCount} jobs):\n`);
  
  const zeroPercent = ((stats.zeroInteractions / jobCount) * 100).toFixed(2);
  const oneToSixPercent = ((stats.oneToSix / jobCount) * 100).toFixed(2);
  
  console.log(`🔵 NO INTERACTIONS (0 swipes):`);
  console.log(`   Count: ${stats.zeroInteractions} / ${jobCount}`);
  console.log(`   Percentage: ${zeroPercent}% (target: 45%)`);
  console.log(`   Status: ${parseFloat(zeroPercent) >= 43 && parseFloat(zeroPercent) <= 47 ? '✅ GOOD' : '⚠️  VARIANCE'}\n`);

  console.log(`🟢 WITH INTERACTIONS (1-6 swipes):`);
  console.log(`   Count: ${stats.oneToSix} / ${jobCount}`);
  console.log(`   Percentage: ${oneToSixPercent}% (target: 55%)`);
  console.log(`   Status: ${parseFloat(oneToSixPercent) >= 53 && parseFloat(oneToSixPercent) <= 57 ? '✅ GOOD' : '⚠️  VARIANCE'}\n`);

  console.log(`${'─'.repeat(80)}`);
  console.log(`📋 DETAILED DISTRIBUTION:\n`);

  // Sort by swipeCount
  const sortedDistribution = Array.from(stats.distribution.entries())
    .sort((a, b) => a[0] - b[0]);

  sortedDistribution.forEach(([swipeCount, count]) => {
    const percent = ((count / jobCount) * 100).toFixed(2);
    const bar = '█'.repeat(Math.round((count / jobCount) * 40));
    console.log(`   ${swipeCount} swipes: ${bar} ${count} (${percent}%)`);
  });

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`\n✅ INTERPRETATION:\n`);
  
  console.log(`🎯 What this means for 100,000 bots:\n`);
  console.log(`   ✅ 45,000 bots → NO interactions (just view page like normal person)`);
  console.log(`   ✅ 55,000 bots → 1-6 interactions each (realistic engagement)\n`);
  
  console.log(`🔒 Anti-Fraud Benefits:\n`);
  console.log(`   ✅ NOT all bots do interactions → less pattern detection`);
  console.log(`   ✅ Different interaction counts → more realistic behavior`);
  console.log(`   ✅ Mix of viewers + clickers → human-like traffic\n`);
  
  console.log(`⏱️  Time Optimization:\n`);
  const avgTimeNoInteractions = 12000; // 8-15s
  const avgTimeWithInteractions = 20000; // 15-30s with interactions
  const totalTimeNoInt = (stats.zeroInteractions * avgTimeNoInteractions) / 1000 / 60; // minutes
  const totalTimeWithInt = (stats.oneToSix * avgTimeWithInteractions) / 1000 / 60; // minutes
  const totalTime = totalTimeNoInt + totalTimeWithInt;
  
  console.log(`   45% jobs (${stats.zeroInteractions}): ${avgTimeNoInteractions/1000}s each = ${totalTimeNoInt.toFixed(1)} min`);
  console.log(`   55% jobs (${stats.oneToSix}): ${avgTimeWithInteractions/1000}s each = ${totalTimeWithInt.toFixed(1)} min`);
  console.log(`   ─────────────────────`);
  console.log(`   TOTAL: ${totalTime.toFixed(1)} minutes for ${jobCount} jobs\n`);
  
  console.log(`${'='.repeat(80)}`);
}

async function main() {
  console.log(`\n`);
  console.log(`${'╔'.padEnd(80, '═')}╗`);
  console.log(`║ 🤖 REALISTIC INTERACTIONS TEST`.padEnd(79) + `║`);
  console.log(`║ Verifying 45% no-interaction / 55% 1-6 interaction pattern`.padEnd(79) + `║`);
  console.log(`${'╚'.padEnd(80, '═')}╝\n`);

  // Test with different job counts
  simulateJobCreation(100);
  await sleep(1000);
  
  simulateJobCreation(1000);
  await sleep(1000);
  
  simulateJobCreation(10000);

  console.log(`\n✅ All distribution tests completed!\n`);
}

main().catch(console.error);
