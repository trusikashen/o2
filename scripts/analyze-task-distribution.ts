// Скрипт для анализа распределения задач - проверяет, насколько хорошо они распределены случайно
import { getJobsByStatus } from '../src/queue/dynamodb-queue';

async function analyzeTaskDistribution() {
  try {
    const now = new Date();
    console.log('\n=== TASK DISTRIBUTION ANALYSIS ===');
    console.log('Current time:', now.toLocaleString('ru-RU', { hour12: false }));
    console.log('Analyzing randomness and spread of scheduled tasks...\n');

    // Get all pending tasks
    const jobs = await getJobsByStatus('pending', 200);
    
    if (jobs.length === 0) {
      console.log('❌ No tasks found');
      return;
    }

    const nowMs = now.getTime();
    const taskDelays = jobs.map(job => {
      const delayMs = job.scheduledTime.getTime() - nowMs;
      const delaySec = delayMs / 1000;
      return { id: job.id, delaySec, delayMs };
    });

    // Sort by time
    taskDelays.sort((a, b) => a.delayMs - b.delayMs);

    // Calculate statistics
    const delays = taskDelays.map(t => t.delaySec);
    const minDelay = Math.min(...delays);
    const maxDelay = Math.max(...delays);
    const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
    const totalSpreadSec = maxDelay - minDelay;

    // Calculate standard deviation (for randomness check)
    const variance = delays.reduce((sum, delay) => sum + Math.pow(delay - avgDelay, 2), 0) / delays.length;
    const stdDev = Math.sqrt(variance);

    console.log(`📊 STATISTICS (${jobs.length} tasks):`);
    console.log(`   Min delay:     ${minDelay.toFixed(1)}s (${(minDelay / 60).toFixed(2)}m)`);
    console.log(`   Max delay:     ${maxDelay.toFixed(1)}s (${(maxDelay / 60).toFixed(2)}m)`);
    console.log(`   Avg delay:     ${avgDelay.toFixed(1)}s (${(avgDelay / 60).toFixed(2)}m)`);
    console.log(`   Total spread:  ${totalSpreadSec.toFixed(1)}s (${(totalSpreadSec / 60).toFixed(2)}m)`);
    console.log(`   Std deviation: ${stdDev.toFixed(1)}s (measure of randomness)`);

    // Check if distribution looks random enough
    const expectedStdDev = totalSpreadSec / Math.sqrt(12); // Theoretical for uniform distribution
    const randomnessRatio = stdDev / expectedStdDev;
    
    console.log(`\n🎲 RANDOMNESS CHECK:`);
    console.log(`   Expected Std Dev (uniform): ${expectedStdDev.toFixed(1)}s`);
    console.log(`   Actual Std Dev:             ${stdDev.toFixed(1)}s`);
    console.log(`   Randomness ratio:           ${randomnessRatio.toFixed(2)}x ${randomnessRatio > 0.7 ? '✅ GOOD' : '⚠️  COULD BE BETTER'}`);

    // Analyze gaps between tasks
    const gaps: number[] = [];
    for (let i = 1; i < taskDelays.length; i++) {
      gaps.push(taskDelays[i].delayMs - taskDelays[i - 1].delayMs);
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const gapStdDev = Math.sqrt(gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length);
    
    console.log(`\n⏱️  GAP ANALYSIS (time between consecutive tasks):`);
    console.log(`   Average gap:    ${(avgGap / 1000).toFixed(1)}s`);
    console.log(`   Gap std dev:    ${(gapStdDev / 1000).toFixed(1)}s`);
    console.log(`   Min gap:        ${(Math.min(...gaps) / 1000).toFixed(1)}s`);
    console.log(`   Max gap:        ${(Math.max(...gaps) / 1000).toFixed(1)}s`);

    // Show first 10 tasks
    console.log(`\n📋 FIRST 10 TASKS (sorted by scheduled time):`);
    taskDelays.slice(0, 10).forEach((task, i) => {
      const localTime = new Date(nowMs + task.delayMs);
      const timeStr = localTime.toLocaleString('ru-RU', { 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
      console.log(`   ${i + 1}. ${timeStr} (in ${(task.delaySec / 60).toFixed(2)}m) - ${task.id.split('-').slice(0,2).join('-')}`);
    });

    // Verdict
    console.log(`\n✅ VERDICT:`);
    if (randomnessRatio > 0.7 && gapStdDev > avgGap * 0.3) {
      console.log('   ✅ Tasks are distributed RANDOMLY and REALISTICALLY!');
      console.log('   ✅ Good variation in timing, mimics human traffic patterns');
    } else if (randomnessRatio > 0.5) {
      console.log('   ⚠️  Tasks have some randomness, but could be more varied');
    } else {
      console.log('   ❌ Tasks seem too linear/predictable');
    }

  } catch (e: any) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}

analyzeTaskDistribution();
