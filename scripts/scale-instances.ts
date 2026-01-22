// Auto-scaling script for DigitalOcean App Platform.
// Monitors DynamoDB queue and scales instances based on workload.
// Run as a cron job every 5 minutes:
//   */5 * * * * cd ~/adsterra && npm run scale:check

import { getQueueStats } from '../src/queue/dynamodb-queue';
import { getAllActiveRuns } from '../src/utils/dynamic-concurrency';
import { calculateOptimalConcurrency } from '../src/utils/concurrency-calculator';

// Configuration
const MIN_INSTANCES = 1; // Always keep at least 1 instance running
const MAX_INSTANCES = 5; // Maximum instances to prevent runaway costs
const TARGET_JOBS_PER_INSTANCE = 200; // Each instance can handle ~200 concurrent jobs
const QUEUE_THRESHOLD_MULTIPLIER = 1.5; // Scale up when queue is 1.5x current capacity

interface ScalingDecision {
  currentInstances: number;
  recommendedInstances: number;
  reason: string;
  queueSize: number;
  activeConcurrency: number;
}

/**
 * Calculate recommended number of instances based on queue and active runs
 */
async function calculateRecommendedInstances(): Promise<ScalingDecision> {
  // Get queue stats
  const queueStats = await getQueueStats();
  const pendingJobs = queueStats.waiting;
  const activeJobs = queueStats.active;
  const totalPending = pendingJobs + activeJobs;

  // Get active runs and calculate total concurrency needed
  const activeRuns = await getAllActiveRuns();
  let totalConcurrencyNeeded = 0;

  for (const run of activeRuns) {
    if (run.config.concurrentJobs) {
      totalConcurrencyNeeded += run.config.concurrentJobs;
    } else if (run.config.targetImpressions) {
      totalConcurrencyNeeded += calculateOptimalConcurrency(run.config.targetImpressions);
    }
  }

  // If no active runs, use queue size as indicator
  if (totalConcurrencyNeeded === 0 && totalPending > 0) {
    // Estimate concurrency needed based on queue size
    totalConcurrencyNeeded = Math.min(200, Math.ceil(totalPending / 10));
  }

  // Calculate instances needed
  const instancesNeeded = Math.ceil(totalConcurrencyNeeded / TARGET_JOBS_PER_INSTANCE);
  const recommendedInstances = Math.max(
    MIN_INSTANCES,
    Math.min(MAX_INSTANCES, instancesNeeded)
  );

  // Determine reason
  let reason = '';
  if (totalConcurrencyNeeded === 0 && totalPending === 0) {
    reason = 'No active runs or pending jobs - scale to minimum';
  } else if (totalConcurrencyNeeded > TARGET_JOBS_PER_INSTANCE) {
    reason = `High concurrency needed (${totalConcurrencyNeeded}) - requires ${instancesNeeded} instances`;
  } else if (totalPending > TARGET_JOBS_PER_INSTANCE * QUEUE_THRESHOLD_MULTIPLIER) {
    reason = `Large queue (${totalPending} jobs) - scale up to process faster`;
  } else {
    reason = `Normal workload - ${totalConcurrencyNeeded} concurrent jobs`;
  }

  // TODO: Get current instance count from DigitalOcean API
  // For now, assume we need to check manually
  const currentInstances = 1; // This would come from DigitalOcean API

  return {
    currentInstances,
    recommendedInstances,
    reason,
    queueSize: totalPending,
    activeConcurrency: totalConcurrencyNeeded,
  };
}

/**
 * Main scaling logic
 */
async function main() {
  try {
    console.log('🔍 Checking scaling requirements...\n');

    const decision = await calculateRecommendedInstances();

    console.log('📊 Current Status:');
    console.log(`   Queue size: ${decision.queueSize.toLocaleString()} jobs`);
    console.log(`   Active concurrency needed: ${decision.activeConcurrency}`);
    console.log(`   Current instances: ${decision.currentInstances}`);
    console.log(`   Recommended instances: ${decision.recommendedInstances}`);
    console.log(`   Reason: ${decision.reason}\n`);

    if (decision.recommendedInstances !== decision.currentInstances) {
      console.log(`⚠️  Scaling recommendation: ${decision.currentInstances} → ${decision.recommendedInstances} instances`);
      console.log('\n📝 To scale manually:');
      console.log('   1. Go to DigitalOcean App Platform dashboard');
      console.log('   2. Navigate to your app → Settings → Components');
      console.log('   3. Update worker instance count to', decision.recommendedInstances);
      console.log('\n🤖 To automate:');
      console.log('   - Set up DigitalOcean API token');
      console.log('   - Use doctl or DigitalOcean API to update instance count');
      console.log('   - Or use DigitalOcean App Platform auto-scaling (if available)');
    } else {
      console.log('✅ Current instance count is optimal');
    }
  } catch (error: any) {
    console.error('❌ Error checking scaling:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { calculateRecommendedInstances };
