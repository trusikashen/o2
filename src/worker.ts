// Load environment variables first
import 'dotenv/config';

// CRITICAL: Disable output buffering on Windows (ensures logs appear immediately)
// This prevents logs from appearing "stuck" when they're actually just buffered
if (process.platform === 'win32') {
  // Force unbuffered output on Windows
  if (process.stdout.isTTY) {
    process.stdout.setDefaultEncoding('utf8');
  }
  // Ensure console.log flushes immediately
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    originalLog(...args);
    if (process.stdout.isTTY) {
      process.stdout.write(''); // Force flush
    }
  };
  const originalError = console.error;
  console.error = (...args: any[]) => {
    originalError(...args);
    if (process.stderr.isTTY) {
      process.stderr.write(''); // Force flush
    }
  };
}

// Ensure Playwright browsers are installed before starting
import './ensure-browsers';

import { getNextJob, getNextJobForRun, getNextJobForWorker, markJobActive, markJobCompleted, markJobFailed } from './queue/dynamodb-queue';
import { AdsterraSession } from './bot/session';
import { queueConfig } from './config';
import { sleep } from './utils/helpers';
import type { AdsterraConfig, AdsterraRun } from './types';
import type { WorkerHeartbeat } from './types/worker-status';
import { getMaxConcurrencyFromActiveRuns } from './utils/dynamic-concurrency';
import { Semaphore } from './utils/semaphore';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

// Global to track last poll log time (prevents spam)
declare global {
  var lastPollLog: number | undefined;
  var workerStartTime: number | undefined;
  var jobsProcessedInSession: number | undefined;
  var currentJobId: string | undefined;
  var currentRunId: string | undefined;
}

// Helper function to check and log run completion immediately (not just every 5 minutes)
async function checkRunCompletionImmediately(runId: string): Promise<void> {
  try {
    const { getAllAdsterraRuns } = await import('./lib/aws/adsterra-helpers');
    const { getQueueStatsByRunId } = await import('./queue/dynamodb-queue');
    const allRuns = await getAllAdsterraRuns();
    const run = allRuns.find(r => r.id === runId);
    
    if (!run || run.status !== 'running') return; // Only check running runs
    
    const stats = await getQueueStatsByRunId(runId);
    
    // Check if run is complete
    if (stats.waiting === 0 && stats.active === 0 && stats.completed > 0) {
      const cpm = 2.365;
      const revenue = (stats.completed / 1000) * cpm;
      const dataGB = (stats.completed * 0.05) / 1024;
      const cost = dataGB * 8;
      const profit = revenue - cost;
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 RUN COMPLETED!');
      console.log('='.repeat(60));
      console.log(`Run: ${runId.substring(0, 8)}...`);
      console.log(`  ✅ Completed: ${stats.completed} / ${stats.completed + stats.failed} (${((stats.completed / (stats.completed + stats.failed)) * 100).toFixed(1)}%)`);
      console.log(`  ❌ Failed: ${stats.failed}`);
      console.log(`  💵 Revenue: $${revenue.toFixed(2)}`);
      console.log(`  💸 Cost: $${cost.toFixed(2)} (${dataGB.toFixed(3)} GB)`);
      console.log(`  💰 Profit: $${profit.toFixed(2)}`);
      console.log(`  📊 Profit Margin: ${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%`);
      
      // Update run status to completed
      try {
        const { updateAdsterraRun } = await import('./lib/aws/adsterra-helpers');
        await updateAdsterraRun(runId, {
          status: 'completed',
          stats: stats,
        });
        console.log(`  ✅ Run status updated to 'completed'`);
      } catch (error: any) {
        console.error(`  ⚠️  Failed to update run status: ${error.message}`);
      }
      
      console.log('='.repeat(60) + '\n');
      
      // Force flush output (especially important on Windows)
      if (process.stdout.isTTY) {
        process.stdout.write('');
      }
    }
  } catch (error: any) {
    // Silently ignore errors in completion check (don't spam logs)
  }
}

/**
 * Send worker heartbeat to frontend
 * Allows frontend to detect which workers are online and their location
 */
async function sendWorkerHeartbeat(workerId: string): Promise<void> {
  try {
    const apiUrl = process.env.API_URL || 'http://localhost:3000';
    const heartbeat: WorkerHeartbeat = {
      workerId,
      timestamp: new Date().toISOString(),
      location: process.env.RUN_ID ? 'aws' : 'local', // AWS workers have RUN_ID set
      ec2InstanceId: process.env.EC2_INSTANCE_ID,
      ec2Region: process.env.AWS_REGION,
      currentJobId: global.currentJobId,
      currentRunId: global.currentRunId,
      jobsProcessedInSession: global.jobsProcessedInSession || 0,
      uptime: global.workerStartTime ? Math.floor((Date.now() - global.workerStartTime) / 1000) : 0,
    };

    await fetch(`${apiUrl}/api/workers/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(heartbeat),
    }).catch(() => {
      // Silently ignore heartbeat errors (network issues, API down, etc.)
    });
  } catch (error) {
    // Silently ignore heartbeat errors
  }
}

// We'll create a new session for each job with the run's config
async function processJob(semaphore: Semaphore, workerId?: string) {
  // Acquire permit from semaphore (waits if at max concurrency)
  await semaphore.acquire();
  
  let job: any = null;
  try {
    const RUN_ID = process.env.RUN_ID;
    const WORKER_ID = workerId || process.env.WORKER_ID || 'default-worker';
    
    // CRITICAL FIX: First, determine pacing mode BEFORE selecting job
    // This ensures we respect scheduling for 'human' mode
    let pacingMode = 'human'; // Default to human (strict scheduling)
    
    if (RUN_ID) {
      // If this worker was launched for a specific run, load that run's config first
      try {
        const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
        const ddbClient = new DynamoDBClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
        const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        
        const result = await ddbDocClient.send(
          new QueryCommand({
            TableName: ADSTERRA_RUNS_TABLE,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
              ':pk': `RUN#${RUN_ID}`,
              ':sk': 'META',
            },
          })
        );

        if (result.Items && result.Items.length > 0) {
          const run = result.Items[0] as any;
          pacingMode = run.config?.pacingMode || 'human';
        }
      } catch (error: any) {
        // Use default pacing mode if error loading config
        pacingMode = 'human';
      }
    }
    
    // Now select job with CORRECT ignoreScheduledTime based on pacing mode
    // For 'human' mode: ALWAYS respect scheduled times (ignoreScheduledTime=false)
    // For other modes: can ignore scheduled times
    const ignoreScheduledTimeFlag = pacingMode !== 'human';
    
    // Priority: if RUN_ID is set, use run-specific query; otherwise use worker-specific query if workerId is provided
    if (RUN_ID) {
      job = await getNextJobForRun(RUN_ID, ignoreScheduledTimeFlag);
    } else if (workerId) {
      job = await getNextJobForWorker(WORKER_ID, ignoreScheduledTimeFlag);
    } else {
      job = await getNextJob(ignoreScheduledTimeFlag);
    }

    if (!job) {
      // No jobs found in initial query — try a final fallback
      // Only ignore schedule if NOT in human mode
      if (!RUN_ID && workerId) {
        job = await getNextJobForWorker(WORKER_ID, ignoreScheduledTimeFlag);
      } else if (RUN_ID) {
        job = await getNextJobForRun(RUN_ID, ignoreScheduledTimeFlag);
      } else {
        job = await getNextJob(ignoreScheduledTimeFlag);
      }
      if (!job) {
        semaphore.release();
        return false;
      }
    }

    // Mark job as active (atomically claim it) with worker ID
    const WORKER_INSTANCE_ID = workerId || WORKER_ID || `worker-${process.env.NODE_APP_INSTANCE || '0'}`;
    const claimed = await markJobActive(job.id, WORKER_INSTANCE_ID);
    if (!claimed) {
      // Another worker already claimed this job - release semaphore and try again
      console.warn(`⚠️  Failed to claim job ${job.id} (likely already claimed).`);
      semaphore.release();
      return false;
    }

    // Load full run config from DynamoDB if runId is provided
    let config: AdsterraConfig | null = null;
    if (job.runId) {
      try {
        const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
        const ddbClient = new DynamoDBClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
        const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
        
        const result = await ddbDocClient.send(
          new QueryCommand({
            TableName: ADSTERRA_RUNS_TABLE,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
              ':pk': `RUN#${job.runId}`,
              ':sk': 'META',
            },
          })
        );

        if (result.Items && result.Items.length > 0) {
          const run = result.Items[0] as any;
          const runStatus = run.status;
          
          // PRODUCTION: Skip jobs from stopped/cancelled runs
          if (runStatus === 'stopped' || runStatus === 'cancelled') {
            console.log(`⏸️  Skipping job from ${runStatus} run: ${job.runId}`);
            // Mark job as failed so it doesn't stay in queue forever
            await markJobFailed(job.id, `Run is ${runStatus}`);
            semaphore.release();
            return true; // Job handled (skipped), continue to next
          }
          
          // Only process jobs from running or pending runs
          if (runStatus !== 'running' && runStatus !== 'pending') {
            console.log(`⏸️  Skipping job from run with status '${runStatus}': ${job.runId}`);
            await markJobFailed(job.id, `Run status is ${runStatus}`);
            semaphore.release();
            return true; // Job handled (skipped), continue to next
          }
          
          config = run.config as AdsterraConfig;
          const finalPacingMode = config?.pacingMode || 'human';
          
          console.log(`📋 Loaded config for run: ${job.runId} (Status: ${runStatus}, Pacing: ${finalPacingMode}, URL: ${config?.adsterraUrl ? 'configured' : 'default'})`);
          
          // CRITICAL FIX: Final verification for human pacing mode
          // This is a safety check in case pacing mode changed between initial query and now
          if (finalPacingMode === 'human') {
            const now = Date.now();
            const scheduledTime = new Date(job.scheduledTime).getTime();
            
            if (scheduledTime > now) {
              // Job is scheduled for the future - reject it and mark as failed
              console.warn(`⏰ Job ${job.id} scheduled for future (${new Date(job.scheduledTime).toISOString()}), rejecting...`);
              await markJobFailed(job.id, `Job scheduled for future: ${new Date(job.scheduledTime).toISOString()}`);
              semaphore.release();
              return true; // Mark as handled (won't be reprocessed)
            }
            // Job is ready (scheduled time has passed) - proceed
          }
          // Fast mode: process immediately regardless of scheduled time
        }
      } catch (error: any) {
    console.error(`⚠️  Failed to load run config for ${job.runId}:`, error.message);
        // Continue with null config (will use defaults)
      }
    }

    // Load and apply worker-specific config if available (overrides run config)
    try {
      const { getWorkerConfig } = await import('./lib/aws/adsterra-helpers');
      const workerConfig = await getWorkerConfig(WORKER_INSTANCE_ID);
      
      if (workerConfig) {
        console.log(`⚙️  Loading worker-specific config for: ${WORKER_INSTANCE_ID}`);
        
        // Initialize config if not loaded from run
        if (!config) {
          config = {} as AdsterraConfig;
        }
        
        // Override with worker-specific settings
        if (workerConfig.adsterraUrl) {
          config.adsterraUrl = workerConfig.adsterraUrl;
        }
        if (workerConfig.browserHeadless !== undefined) {
          config.browserHeadless = workerConfig.browserHeadless;
        }
        if (workerConfig.minScrollWait !== undefined) {
          config.minScrollWait = workerConfig.minScrollWait;
        }
        if (workerConfig.maxScrollWait !== undefined) {
          config.maxScrollWait = workerConfig.maxScrollWait;
        }
        if (workerConfig.minAdWait !== undefined) {
          config.minAdWait = workerConfig.minAdWait;
        }
        if (workerConfig.maxAdWait !== undefined) {
          config.maxAdWait = workerConfig.maxAdWait;
        }
        
        console.log(`✅ Applied worker config override: ${WORKER_INSTANCE_ID}`);
      }
    } catch (error: any) {
      // Worker config not found or error loading - continue with run config
      // This is OK - worker configs are optional
    }

    // Create session with config (or use defaults)
    const session = new AdsterraSession(config);

    console.log(`\n🚀 [${job.botId}] Session ${job.sessionNumber}: Starting...`);
    const jobStartTime = Date.now();

    // Execute the bot session (pass full job object for realistic session features)
    const result = await session.execute(job.botId, job.sessionNumber, job.distribution, job);

    if (result.success) {
      // Mark job as completed
      await markJobCompleted(job.id);
      const jobDuration = Date.now() - jobStartTime;
      console.log(`✅ [${job.botId}] Session ${job.sessionNumber}: Completed in ${(jobDuration / 1000).toFixed(1)}s`);
      
      // Check if run is complete immediately (not wait for 5-minute interval)
      if (job.runId) {
        await checkRunCompletionImmediately(job.runId);
      }
      
      semaphore.release();
      return true;
    } else {
      // Mark job as failed
      await markJobFailed(job.id, result.error || 'Session failed');
      const jobDuration = Date.now() - jobStartTime;
      console.error(`❌ [${job.botId}] Session ${job.sessionNumber}: Failed after ${(jobDuration / 1000).toFixed(1)}s - ${result.error}`);
      
      // Check if run is complete immediately (even if last job failed)
      if (job.runId) {
        await checkRunCompletionImmediately(job.runId);
      }
      
      semaphore.release();
      return true;
    }
  } catch (error: any) {
    // Mark job as failed
    if (job) {
      await markJobFailed(job.id, error.message || 'Unknown error');
      console.error(`❌ [${job.botId}] Session ${job.sessionNumber}: Error - ${error.message}`);
      if (error.stack) {
        console.error(`   Stack: ${error.stack.split('\n')[1]?.trim()}`);
      }
    }
    semaphore.release();
    return true;
  }
}

async function workerLoop() {
  const PROCESS_IMMEDIATELY = (process.env.PROCESS_IMMEDIATELY ?? 'true') === 'true';
  
  // Fetch concurrency dynamically from active runs, but cap it to prevent system freeze
  const MAX_SAFE_CONCURRENCY = parseInt(process.env.MAX_CONCURRENT_BROWSERS || '10', 10); // Safe default: 10 browsers max
  const fallbackConcurrency = parseInt(process.env.CONCURRENT_JOBS || '5', 10);
  
  let currentConcurrency = await getMaxConcurrencyFromActiveRuns();
  if (currentConcurrency < 2) {
    currentConcurrency = fallbackConcurrency;
  }
  // Cap concurrency to prevent system freeze (especially with headed browsers)
  currentConcurrency = Math.min(currentConcurrency, MAX_SAFE_CONCURRENCY);
  
  // Create semaphore with dynamic concurrency
  const semaphore = new Semaphore(currentConcurrency);
  
  // Spawn worker threads that compete for semaphore permits
  // Keep worker threads slightly higher than max concurrency to ensure we always have jobs ready
  // CRITICAL: MAX_WORKER_THREADS should equal currentConcurrency (not more)
  // Each worker thread can process ONE job at a time
  // If we have more threads than concurrency limit, we'll start too many jobs simultaneously
  // Example: currentConcurrency=5 but threads=10 means all 10 could grab jobs at once!
  const MAX_WORKER_THREADS = Math.min(
    currentConcurrency, // MUST equal concurrency - one job per thread max
    parseInt(process.env.MAX_WORKER_THREADS || '10', 10) // Hard cap at 10 by default
  );
  
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Adsterra Bot Worker started');
  console.log('='.repeat(60));
  console.log(`⏱️  Polling interval: ${queueConfig.pollInterval}ms`);
  console.log(`⚡ Process immediately: ${PROCESS_IMMEDIATELY ? 'Yes (ignoring scheduled times)' : 'No (respecting scheduled times)'}`);
  console.log(`🔄 Concurrent browsers: ${currentConcurrency} (max: ${MAX_SAFE_CONCURRENCY})`);
  console.log(`🧵 Worker threads: ${MAX_WORKER_THREADS}`);
  console.log('💡 Waiting for jobs...\n');

  // Start periodic concurrency update and summary (every 5 minutes)
  const concurrencyUpdateInterval = setInterval(async () => {
    try {
      let newConcurrency = await getMaxConcurrencyFromActiveRuns();
      // Apply same safety cap
      newConcurrency = Math.min(newConcurrency, MAX_SAFE_CONCURRENCY);
      
      if (newConcurrency !== currentConcurrency && newConcurrency >= 2) {
        const oldConcurrency = currentConcurrency;
        currentConcurrency = newConcurrency;
        semaphore.setMaxPermits(newConcurrency);
        console.log(`\n🔄 Concurrency updated: ${oldConcurrency} → ${newConcurrency} (capped at ${MAX_SAFE_CONCURRENCY})`);
      }
      
      // Log summary of active runs
      const { getAllAdsterraRuns } = await import('./lib/aws/adsterra-helpers');
      const allRuns = await getAllAdsterraRuns();
      const activeRuns = allRuns.filter(run => run.status === 'running' || run.status === 'pending');
      
      if (activeRuns.length > 0) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 Run Summary (Every 5 minutes)');
        console.log('='.repeat(60));
        
        for (const run of activeRuns) {
          const { getQueueStatsByRunId } = await import('./queue/dynamodb-queue');
          const stats = await getQueueStatsByRunId(run.id);
          
          const total = stats.waiting + stats.active + stats.completed + stats.failed;
          const progress = total > 0 ? ((stats.completed / total) * 100).toFixed(1) : '0.0';
          const successRate = (stats.completed + stats.failed) > 0 
            ? ((stats.completed / (stats.completed + stats.failed)) * 100).toFixed(1) 
            : '0.0';
          
          console.log(`\nRun: ${run.id.substring(0, 8)}...`);
          console.log(`  ✅ Completed: ${stats.completed} / ${total} (${progress}%)`);
          console.log(`  ❌ Failed: ${stats.failed}`);
          console.log(`  ⏳ Waiting: ${stats.waiting}`);
          console.log(`  🔄 Active: ${stats.active}`);
          console.log(`  📈 Success Rate: ${successRate}%`);
          
          // PRODUCTION: Auto-mark run as completed when all jobs are done (but only if still running)
          // Note: Completion is also checked immediately after each job, so this is just a periodic summary
          if (stats.waiting === 0 && stats.active === 0 && stats.completed > 0 && run.status === 'running') {
            const cpm = 2.365;
            const revenue = (stats.completed / 1000) * cpm;
            const dataGB = (stats.completed * 0.05) / 1024;
            const cost = dataGB * 8;
            const profit = revenue - cost;
            
            // Only log if not already completed (to avoid duplicate messages)
            // The immediate check should have already logged this, but this serves as a periodic reminder
            console.log(`\n  🎉 RUN COMPLETED! (Periodic check)`);
            console.log(`  💵 Revenue: $${revenue.toFixed(2)}`);
            console.log(`  💸 Cost: $${cost.toFixed(2)} (${dataGB.toFixed(3)} GB)`);
            console.log(`  💰 Profit: $${profit.toFixed(2)}`);
            console.log(`  📊 Profit Margin: ${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}%`);
            
            // Update run status to completed (only if still running - don't override stopped)
            try {
              const { updateAdsterraRun } = await import('./lib/aws/adsterra-helpers');
              await updateAdsterraRun(run.id, {
                status: 'completed',
                stats: stats,
              });
              console.log(`  ✅ Run status updated to 'completed'`);
            } catch (error: any) {
              console.error(`  ⚠️  Failed to update run status: ${error.message}`);
            }
          }
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
      }
    } catch (error: any) {
      console.error('Error updating concurrency/summary:', error.message);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Initialize global tracking variables
  global.workerStartTime = Date.now();
  global.jobsProcessedInSession = 0;
  global.currentJobId = undefined;
  global.currentRunId = undefined;

  let processedCount = 0;
  let consecutiveEmptyPolls = 0;
  const maxEmptyPolls = 10; // Stop if no jobs found after 10 polls
  let pollCount = 0;

  // Stagger browser launches to prevent system overload and proxy overload
  // Longer stagger (5-10s) gives proxy time to handle each connection properly
  // This prevents 502 errors from too many simultaneous proxy connections
  const LAUNCH_STAGGER_MS = parseInt(process.env.LAUNCH_STAGGER_MS || '5000', 10); // 5 seconds between launches (increased from 3s)
  let lastLaunchTime = 0;
  const launchMutex = new Semaphore(1); // Only one browser can be in "launching" state at a time
  
  console.log(`⏱️  Launch stagger: ${LAUNCH_STAGGER_MS}ms between browsers`);

  // Setup heartbeat for frontend worker detection
  const WORKER_ID = process.env.WORKER_ID || `worker-${process.env.NODE_APP_INSTANCE || '0'}`;
  const heartbeatInterval = setInterval(() => {
    sendWorkerHeartbeat(WORKER_ID).catch(() => {
      // Silently ignore heartbeat errors
    });
  }, 5000); // Every 10 seconds

  const workers: Promise<void>[] = [];
  
  for (let i = 0; i < MAX_WORKER_THREADS; i++) {
    workers.push((async () => {
      // Generate unique worker ID for this thread
      // Priority: WORKER_ID env var > NODE_APP_INSTANCE from PM2 > thread index
      const workerId = 
        process.env.WORKER_ID || 
        (process.env.NODE_APP_INSTANCE ? `worker-${process.env.NODE_APP_INSTANCE}` : null) ||
        `worker-${i}`;
      
      while (true) {
        let hasMutex = false;
        
        try {
          // Stagger launches: ensure minimum delay since last browser started
          await launchMutex.acquire();
          hasMutex = true;
          
          const now = Date.now();
          const timeSinceLastLaunch = now - lastLaunchTime;
          if (timeSinceLastLaunch < LAUNCH_STAGGER_MS && lastLaunchTime > 0) {
            const waitTime = LAUNCH_STAGGER_MS - timeSinceLastLaunch;
            await sleep(waitTime);
          }
          lastLaunchTime = Date.now();
          
          // Release mutex BEFORE processing job (allow next worker to start staggering)
          launchMutex.release();
          hasMutex = false;
          
          const hadJob = await processJob(semaphore, workerId);
          if (hadJob) {
            processedCount++;
            // PRODUCTION: Minimal delay to keep jobs moving efficiently
            await sleep(50); // Reduced from 100ms to 50ms for faster processing
          } else {
            // No job available - wait before polling again
            // Reduce log spam - only log when actually polling (not every 1s)
            const now = Date.now();
            if (!global.lastPollLog || now - global.lastPollLog > 60000) {
              console.log(`💤 No jobs available, polling again in ${queueConfig.pollInterval}ms...`);
              global.lastPollLog = now;
            }
            await sleep(queueConfig.pollInterval);
          }
        } catch (error: any) {
          console.error(`Worker ${i} error:`, error.message);
          
          // Clean up mutex if we still hold it
          if (hasMutex) {
            launchMutex.release();
          }
          
          await sleep(5000);
        }
      }
    })());
  }

  // Cleanup on shutdown
  process.on('SIGTERM', () => {
    clearInterval(concurrencyUpdateInterval);
    clearInterval(heartbeatInterval);
  });
  process.on('SIGINT', () => {
    clearInterval(concurrencyUpdateInterval);
    clearInterval(heartbeatInterval);
  });

  await Promise.all(workers);
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\nSIGTERM received, shutting down worker...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down worker...');
  process.exit(0);
});

// Start the worker
workerLoop().catch((error) => {
  console.error('Fatal worker error:', error);
  process.exit(1);
});

