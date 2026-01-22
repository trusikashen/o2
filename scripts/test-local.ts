/**
 * Local Test Runner
 * 
 * This script runs a test locally by:
 * 1. Creating jobs for the run in DynamoDB
 * 2. Processing jobs locally using the worker
 * 
 * Usage:
 *   tsx scripts/test-local.ts <runId>
 */

import 'dotenv/config';
import { createJobsForRun } from '../src/orchestrator-run';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getNextJobForRun, markJobActive, markJobCompleted, markJobFailed } from '../src/queue/dynamodb-queue';
import { AdsterraSession } from '../src/bot/session';
import type { AdsterraConfig, AdsterraRun } from '../src/types';
import { Semaphore } from '../src/utils/semaphore';
import { calculateOptimalConcurrency } from '../src/utils/concurrency-calculator';

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function getAdsterraRun(runId: string): Promise<AdsterraRun | null> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `RUN#${runId}`,
        ':sk': 'META',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const item = result.Items[0];
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    config: item.config,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stats: item.stats,
  };
}

async function processJobLocally(runId: string, config: AdsterraConfig | null): Promise<{ hadJob: boolean; success: boolean }> {
  // Get next job for this run (process immediately, ignore scheduled time for local test)
  const job = await getNextJobForRun(runId, true);
  
  if (!job) {
    return { hadJob: false, success: false }; // No more jobs
  }

  try {
    // Mark job as active
    await markJobActive(job.id);
    
          console.log(`\n🔄 Processing job: ${job.id} (Session ${job.sessionNumber})`);
          if (job.distribution) {
            console.log(`   📊 Distribution Assignment: ${job.distribution.country} + ${job.distribution.deviceType} + ${job.distribution.browserType} (${job.distribution.deviceName})`);
          } else {
            console.log(`   ⚠️  No distribution assignment - using random selection`);
          }

          // Create session with config
          const session = new AdsterraSession(config);
    
    // Execute session (pass botId, sessionNumber, and distribution)
    const result = await session.execute(job.botId, job.sessionNumber, job.distribution);
    
    if (result.success) {
      await markJobCompleted(job.id);
      console.log(`✅ Job completed: ${job.id}`);
      if (result.articleUrl) {
        console.log(`   📄 Article: ${result.articleUrl}`);
      }
      if (result.duration) {
        console.log(`   ⏱️  Duration: ${(result.duration / 1000).toFixed(1)}s`);
      }
      return { hadJob: true, success: true };
    } else {
      await markJobFailed(job.id, result.error || 'Session failed');
      console.error(`❌ Job failed: ${job.id} - ${result.error}`);
      return { hadJob: true, success: false }; // Continue processing other jobs
    }
  } catch (error: any) {
    await markJobFailed(job.id, error.message || 'Unknown error');
    console.error(`❌ Job error: ${job.id} - ${error.message}`);
    return { hadJob: true, success: false }; // Continue processing other jobs
  }
}

async function runLocalTest(runId: string) {
  console.log('='.repeat(60));
  console.log('🧪 Local Test Runner');
  console.log('='.repeat(60));
  console.log(`Run ID: ${runId}`);
  console.log('');

  // Load run from DynamoDB
  const run = await getAdsterraRun(runId);
  if (!run) {
    console.error(`❌ Run ${runId} not found in DynamoDB`);
    process.exit(1);
  }

  console.log(`📋 Run: ${run.name}`);
  console.log(`📊 Target Impressions: ${run.config.targetImpressions || 'N/A'}`);
  console.log(`🤖 Total Bots: ${run.config.totalBots || 'N/A'}`);
  console.log(`🔄 Sessions per Bot: ${run.config.sessionsPerBot || 'N/A'}`);
  console.log(`👁️  Headless: ${run.config.browserHeadless !== false ? 'Yes' : 'No'}`);
  console.log(`⏱️  Pacing Mode: ${run.config.pacingMode || 'human'}`);
  if (run.config.distribution) {
    console.log(`📊 Distribution Config:`, JSON.stringify(run.config.distribution, null, 2));
  } else {
    console.log(`⚠️  No distribution config found - jobs will use random selection`);
  }
  console.log('');

  // Check if jobs already exist, if not create them
  console.log('📝 Checking for existing jobs...');
  try {
    const { getQueueStatsByRunId } = await import('../src/queue/dynamodb-queue');
    const stats = await getQueueStatsByRunId(runId);
    
    if (stats.total > 0) {
      console.log(`✅ Jobs already exist: ${stats.total} jobs found (${stats.waiting} waiting, ${stats.active} active, ${stats.completed} completed)`);
      console.log('   Skipping job creation - using existing jobs');
    } else {
      console.log('📝 No existing jobs found, creating jobs in DynamoDB...');
      await createJobsForRun(runId);
      console.log('✅ Jobs created successfully');
    }
  } catch (error: any) {
    // If error is "already running", jobs might already exist - try to continue
    if (error.message?.includes('already running')) {
      console.log('⚠️  Run is marked as running, but checking for existing jobs...');
      const { getQueueStatsByRunId } = await import('../src/queue/dynamodb-queue');
      const stats = await getQueueStatsByRunId(runId);
      if (stats.total > 0) {
        console.log(`✅ Found ${stats.total} existing jobs, continuing...`);
      } else {
        console.error(`❌ No jobs found and cannot create new ones: ${error.message}`);
        process.exit(1);
      }
    } else {
      console.error(`❌ Failed to create jobs: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('');
  
  // Calculate concurrency from run config
  const concurrency = run.config.concurrentJobs || 
    (run.config.targetImpressions ? calculateOptimalConcurrency(run.config.targetImpressions) : 2);
  
  // Allow override via env var for testing
  const testConcurrency = process.env.TEST_CONCURRENCY 
    ? parseInt(process.env.TEST_CONCURRENCY, 10) 
    : concurrency;
  
  // Cap concurrency to prevent system freeze (especially with headed browsers)
  const MAX_SAFE_CONCURRENCY = parseInt(process.env.MAX_CONCURRENT_BROWSERS || '10', 10);
  const safeConcurrency = Math.min(testConcurrency, MAX_SAFE_CONCURRENCY);
  
  // Spawn worker threads - just slightly more than concurrency to keep pipeline full
  // NOT too many - with headed browsers each thread = 1 browser = lots of RAM/CPU
  const MAX_WORKER_THREADS = Math.min(safeConcurrency + 5, 15); // Hard cap at 15
  
  console.log('🚀 Starting local worker...');
  console.log(`   🔄 Concurrency: ${safeConcurrency} browsers (requested: ${testConcurrency}, max safe: ${MAX_SAFE_CONCURRENCY})`);
  console.log(`   🧵 Worker threads: ${MAX_WORKER_THREADS}`);
  console.log('   💡 Set TEST_CONCURRENCY or MAX_CONCURRENT_BROWSERS env vars to override');
  console.log('');

  // Create semaphore for concurrency control
  const semaphore = new Semaphore(safeConcurrency);
  
  // Stagger browser launches to prevent system overload
  // Each new browser waits for this delay after the previous one started
  const LAUNCH_STAGGER_MS = parseInt(process.env.LAUNCH_STAGGER_MS || '3000', 10); // 3 seconds between launches
  let lastLaunchTime = 0;
  const launchMutex = new Semaphore(1); // Only one browser can be in "launching" state at a time
  
  // Track statistics
  let processedCount = 0;
  let successCount = 0;
  let failCount = 0;
  let activeJobs = 0;
  const workers: Promise<void>[] = [];
  let allJobsProcessed = false;
  
  console.log(`   ⏱️  Launch stagger: ${LAUNCH_STAGGER_MS}ms between browsers`);
  console.log('');
  
  for (let i = 0; i < MAX_WORKER_THREADS; i++) {
    workers.push((async () => {
      while (!allJobsProcessed) {
        let hasSemaphore = false;
        let hasMutex = false;
        let jobStarted = false;
        
        try {
          // Acquire semaphore permit (waits if at max concurrency)
          await semaphore.acquire();
          hasSemaphore = true;
          
          // Stagger launches: wait for mutex, then ensure minimum delay since last launch
          await launchMutex.acquire();
          hasMutex = true;
          
          const now = Date.now();
          const timeSinceLastLaunch = now - lastLaunchTime;
          if (timeSinceLastLaunch < LAUNCH_STAGGER_MS && lastLaunchTime > 0) {
            const waitTime = LAUNCH_STAGGER_MS - timeSinceLastLaunch;
            console.log(`   ⏳ Staggering: waiting ${(waitTime / 1000).toFixed(1)}s before next browser...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
          lastLaunchTime = Date.now();
          
          // Release mutex BEFORE starting job (allow next browser to start staggering)
          launchMutex.release();
          hasMutex = false;
          
          activeJobs++;
          jobStarted = true;
          
          const result = await processJobLocally(runId, run.config);
          
          activeJobs--;
          jobStarted = false;
          
          // Release semaphore after job completes
          semaphore.release();
          hasSemaphore = false;
    
          if (!result.hadJob) {
            // No more jobs available - check if we should stop
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
    
          processedCount++;
          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
    
          // Small delay between jobs
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error: any) {
          console.error(`Worker ${i} error:`, error.message);
          
          // Clean up properly on error
          if (jobStarted) activeJobs--;
          if (hasMutex) launchMutex.release();
          if (hasSemaphore) semaphore.release();
          
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    })());
  }
  
  // Monitor for completion - stop when no jobs are available and all workers are idle
  const checkInterval = setInterval(async () => {
    const { getQueueStatsByRunId } = await import('../src/queue/dynamodb-queue');
    const stats = await getQueueStatsByRunId(runId);
    
    const remaining = stats.waiting + stats.active;
    if (remaining === 0 && activeJobs === 0) {
      allJobsProcessed = true;
      clearInterval(checkInterval);
    }
  }, 2000);
  
  // Wait for all workers to complete
  await Promise.all(workers);
  clearInterval(checkInterval);

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log(`Total Jobs Processed: ${processedCount}`);
  console.log(`✅ Successful: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log('='.repeat(60));
}

// Get runId from command line args
const runId = process.argv[2];

if (!runId) {
  console.error('Usage: tsx scripts/test-local.ts <runId>');
  process.exit(1);
}

runLocalTest(runId).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

