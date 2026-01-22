/**
 * Check run statistics from DynamoDB
 * Shows completed, failed, active, waiting jobs for a specific run
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getQueueStatsByRunId } from '../src/queue/dynamodb-queue';
import { getAdsterraRun } from '../src/lib/aws/adsterra-helpers';

// Load .env
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

async function checkRunStats() {
  const runId = process.argv[2];
  
  if (!runId) {
    console.error('❌ Please provide a run ID');
    console.log('Usage: tsx scripts/check-run-stats.ts <runId>');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Checking Stats for Run: ${runId}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Get run config
    const run = await getAdsterraRun(runId);
    if (!run) {
      console.error(`❌ Run ${runId} not found`);
      process.exit(1);
    }

    console.log(`📋 Run: ${run.name}`);
    console.log(`🎯 Target Impressions: ${run.config.targetImpressions.toLocaleString()}`);
    console.log(`🤖 Total Bots: ${run.config.totalBots.toLocaleString()}`);
    console.log(`📊 Sessions per Bot: ${run.config.sessionsPerBot}`);
    console.log(`📈 Total Sessions: ${(run.config.totalBots * run.config.sessionsPerBot).toLocaleString()}\n`);

    // Get queue stats
    const stats = await getQueueStatsByRunId(runId);
    
    console.log('📊 Job Statistics:');
    console.log(`   ✅ Completed: ${stats.completed.toLocaleString()}`);
    console.log(`   ❌ Failed: ${stats.failed.toLocaleString()}`);
    console.log(`   🔄 Active: ${stats.active.toLocaleString()}`);
    console.log(`   ⏳ Waiting: ${stats.waiting.toLocaleString()}`);
    console.log(`   📦 Total: ${stats.total.toLocaleString()}\n`);

    // Calculate metrics
    const totalProcessed = stats.completed + stats.failed;
    const successRate = totalProcessed > 0 ? (stats.completed / totalProcessed) * 100 : 0;
    const progress = (stats.completed / run.config.targetImpressions) * 100;
    
    // Calculate revenue (using $2.365 CPM from user's data)
    const cpm = 2.365;
    const impressions = stats.completed;
    const estimatedRevenue = (impressions / 1000) * cpm;
    
    // Calculate data usage and cost
    const dataUsedMB = impressions * 0.05; // 0.05 MB per session
    const dataUsedGB = dataUsedMB / 1024;
    const estimatedCost = dataUsedGB * 8; // $8/GB
    const estimatedProfit = estimatedRevenue - estimatedCost;

    console.log('💰 Financial Metrics:');
    console.log(`   📊 Impressions: ${impressions.toLocaleString()}`);
    console.log(`   💵 Estimated Revenue: $${estimatedRevenue.toFixed(2)}`);
    console.log(`   💸 Estimated Cost: $${estimatedCost.toFixed(2)} (${dataUsedGB.toFixed(3)} GB)`);
    console.log(`   💰 Estimated Profit: $${estimatedProfit.toFixed(2)}`);
    console.log(`   📈 Profit Margin: ${estimatedRevenue > 0 ? ((estimatedProfit / estimatedRevenue) * 100).toFixed(1) : 0}%\n`);

    console.log('📈 Progress:');
    console.log(`   ✅ Completed: ${stats.completed.toLocaleString()} / ${run.config.targetImpressions.toLocaleString()}`);
    console.log(`   📊 Progress: ${progress.toFixed(2)}%`);
    console.log(`   ✅ Success Rate: ${successRate.toFixed(1)}%\n`);

    // Calculate rate
    if (stats.completed > 0) {
      // Estimate time based on average session duration (60 seconds)
      const avgSessionTime = 60; // seconds
      const remainingSessions = run.config.targetImpressions - stats.completed;
      const estimatedTimeRemaining = (remainingSessions * avgSessionTime) / 3600; // hours
      
      console.log('⏱️  Time Estimates:');
      console.log(`   ⏳ Remaining Sessions: ${remainingSessions.toLocaleString()}`);
      console.log(`   ⏰ Estimated Time Remaining: ${estimatedTimeRemaining.toFixed(1)} hours`);
      console.log(`   📊 (Assuming 1 worker processing sequentially)\n`);
    }

    // Check if jobs are scheduled for future
    if (stats.waiting > 0) {
      console.log('⚠️  Note:');
      console.log(`   ${stats.waiting.toLocaleString()} jobs are still waiting (scheduled for future times)`);
      console.log(`   Jobs are spread across 24 hours, so many may not be ready yet.\n`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkRunStats();
