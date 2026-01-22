/**
 * Create jobs for an Adsterra run
 * Implements distribution logic directly to avoid Next.js import issues
 */
import type { AdsterraRun } from '@/types/adsterra';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { calculateDistributionMatrix, type DistributionMatrix, type DistributionMatrixEntry } from './distribution-calculator';
import { generateWarmUpSites } from '../../utils/warm-up-sites';
import { generateReferrer } from '../../utils/referrer-generator';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function chooseHumanWindowHours(targetImpressions: number, configuredHours?: number): number {
  // If user specified pacing hours, use that (allow 0.25 hours = 15 min minimum)
  if (configuredHours && configuredHours > 0) {
    return Math.max(0.25, Math.min(24, configuredHours));
  }
  
  // Auto-calculate based on volume (default: spread across more time for natural appearance)
  if (targetImpressions <= 20) return 0.5;   // Very small runs (10-20): 30 minutes
  if (targetImpressions <= 100) return 1;    // Small runs: 1 hour
  if (targetImpressions <= 1000) return 2;   // Small-medium runs: 2 hours
  if (targetImpressions <= 10000) return 4;  // Medium runs: 4 hours
  if (targetImpressions <= 25000) return 8;  // Large runs: 8 hours
  if (targetImpressions <= 50000) return 12; // Very large runs: 12 hours
  return 16;                                  // Huge runs: 16 hours
}

function sampleEasedProgress(u: number): number {
  return 3 * u * u - 2 * u * u * u;
}

interface SessionJob {
  id: string;
  botId: string;
  sessionNumber: number;
  runId: string;
  scheduledTime: Date;
  status: string;
  assignedWorkerId?: string; // Optional: specific worker to process this job
  distribution?: {
    country: string;
    deviceType: string;
    deviceName: string;
    browserType: string;
  };
  // Realistic session fields
  warmUpSites: string[];
  referrer: string;
  sessionSeed: string;
  ctrEnabled: boolean;
  swipeCount: number;
}

export async function createJobsForRun(run: AdsterraRun): Promise<void> {
  const config = run.config;
  const jobs: SessionJob[] = [];
  
  // CRITICAL: Use UTC time, not local time!
  // This ensures tasks are scheduled in the future regardless of timezone
  const now = new Date();
  const nowMs = now.getTime();
  const pacingMode = config.pacingMode || 'human';

  // Macro pacing - use configured hours or auto-calculate
  const windowHours = pacingMode === 'fast' ? 0 : chooseHumanWindowHours(config.targetImpressions, config.pacingHours);
  const msWindow = windowHours * 60 * 60 * 1000;

  // Calculate actual number of jobs to create
  const targetImpressions = config.targetImpressions || (config.totalBots * config.sessionsPerBot);
  const calculatedSessions = config.totalBots * config.sessionsPerBot;
  
  // If targetImpressions is specified and doesn't match calculated, adjust
  let actualTotalBots = config.totalBots;
  let actualSessionsPerBot = config.sessionsPerBot;
  let jobsToCreate = targetImpressions;
  
  if (targetImpressions !== calculatedSessions && config.targetImpressions) {
    // Adjust to match targetImpressions exactly
    if (targetImpressions < calculatedSessions) {
      // Need fewer jobs - reduce sessions per bot or bots
      actualSessionsPerBot = Math.floor(targetImpressions / config.totalBots);
      const remainder = targetImpressions % config.totalBots;
      jobsToCreate = targetImpressions;
      console.log(`⚠️  Adjusting: targetImpressions (${targetImpressions}) < calculated (${calculatedSessions})`);
      console.log(`   Will create ${actualSessionsPerBot} sessions per bot for most bots, with ${remainder} extra sessions`);
    } else {
      // Need more jobs - add extra sessions
      const extraSessions = targetImpressions - calculatedSessions;
      jobsToCreate = targetImpressions;
      console.log(`⚠️  Adjusting: targetImpressions (${targetImpressions}) > calculated (${calculatedSessions})`);
      console.log(`   Will add ${extraSessions} extra sessions`);
    }
  }

  console.log(
    `Creating ${actualTotalBots} bots with ${actualSessionsPerBot} sessions each for run ${run.id}...`
  );
  console.log(
    `Target impressions: ${targetImpressions}, Jobs to create: ${jobsToCreate}`
  );
  console.log(
    `Pacing mode: ${pacingMode} ${pacingMode === 'human' ? `(spread over ~${windowHours}h)` : '(immediate)'}`
  );

  // Handle distribution if configured
  let distributionMatrix: DistributionMatrix | null = null;
  if (config.distribution) {
    console.log('📊 Distribution config found, calculating distribution matrix...');
    
    // Use actual target impressions for distribution calculation
    const totalSessions = jobsToCreate;
    distributionMatrix = calculateDistributionMatrix(config.distribution, totalSessions);
    console.log(`✅ Distribution matrix calculated: ${distributionMatrix.total} impressions across ${distributionMatrix.entries.length} combinations`);
    
    // Log distribution summary
    const countrySummary: Record<string, number> = {};
    const deviceSummary: Record<string, number> = {};
    const browserSummary: Record<string, number> = {};
    
    for (const entry of distributionMatrix.entries) {
      countrySummary[entry.country] = (countrySummary[entry.country] || 0) + entry.count;
      deviceSummary[entry.deviceType] = (deviceSummary[entry.deviceType] || 0) + entry.count;
      browserSummary[entry.browserType] = (browserSummary[entry.browserType] || 0) + entry.count;
    }
    
    console.log('📊 Distribution Summary:');
    console.log('  Countries:', Object.entries(countrySummary).map(([k, v]) => `${k}: ${v}`).join(', '));
    console.log('  Devices:', Object.entries(deviceSummary).map(([k, v]) => `${k}: ${v}`).join(', '));
    console.log('  Browsers:', Object.entries(browserSummary).map(([k, v]) => `${k}: ${v}`).join(', '));
  } else {
    console.log('⚠️  No distribution config found, using random device/browser selection');
  }

  // Create all jobs first
  let jobCount = 0;
  const remainder = jobsToCreate % actualTotalBots; // Extra sessions to distribute
  
  // Get list of assigned worker IDs if any (for distributing jobs across specific workers)
  const assignedWorkerIds = run.assignedWorkerIds || [];
  
  for (let botIndex = 0; botIndex < actualTotalBots && jobCount < jobsToCreate; botIndex++) {
    const botId = `bot-${String(botIndex).padStart(5, '0')}`;

    // Calculate sessions for this bot
    // First 'remainder' bots get one extra session if needed
    const sessionsForThisBot = actualSessionsPerBot + (botIndex < remainder ? 1 : 0);

    for (let sessionNum = 1; sessionNum <= sessionsForThisBot && jobCount < jobsToCreate; sessionNum++) {
      let scheduledTime: Date;
      if (pacingMode === 'fast') {
        // Fast mode: start immediately from current UTC time
        scheduledTime = new Date(nowMs);
      } else {
        // Human mode: spread tasks over configured window with randomness
        // This creates realistic traffic patterns by combining multiple randomization layers
        
        const sessionProgress = (sessionNum - 1) / Math.max(1, sessionsForThisBot - 1);
        const eased = sampleEasedProgress(clamp(sessionProgress, 0, 1));
        const baseDelay = eased * msWindow;

        // Layer 1: Small jitter for natural microsecond-level variation (0-60 seconds)
        const smallJitterMs = random(0, 60 * 1000);
        
        // Layer 2: Bot-specific offset to distribute bots across the window
        const botOffset = (botIndex / Math.max(1, actualTotalBots)) * clamp(msWindow / Math.max(1, sessionsForThisBot), 0, msWindow);
        
        // Layer 3: Medium jitter - sudden pauses that mimic user think time (0-10 minutes, 5% chance)
        const mediumPauseChance = 0.05;
        const mediumPauseMs = Math.random() < mediumPauseChance ? random(2 * 60 * 1000, 10 * 60 * 1000) : 0;

        // Layer 4: Large jitter - rare long pauses mimicking user leaving for a while (5-30 minutes, 2% chance)
        const longPauseChance = 0.02;
        const longPauseMs = Math.random() < longPauseChance ? random(5 * 60 * 1000, 30 * 60 * 1000) : 0;

        // Layer 5: Random session delay - vary when sessions within same bot are triggered
        // This creates more unpredictable patterns than linear progression
        const sessionRandomFactor = Math.random() * 0.3; // ±30% variation from ideal position
        const sessionRandomMs = (sessionRandomFactor - 0.15) * msWindow;

        // Calculate scheduled time from current UTC moment
        // All layers combine to create realistic, non-linear traffic pattern
        const scheduledMs = nowMs + baseDelay + smallJitterMs + botOffset + mediumPauseMs + longPauseMs + sessionRandomMs;
        scheduledTime = new Date(scheduledMs);
        
        // Safety check: ensure task is not in the past (should never happen, but just in case)
        if (scheduledTime.getTime() < nowMs) {
          console.warn(`⚠️  Task ${jobCount + 1} was scheduled in past (${scheduledTime.toISOString()}), resetting to now`);
          scheduledTime = new Date(nowMs);
        }
      }

      const jobId = `${run.id}-${botId}-session-${sessionNum}`;

      // Generate realistic session data per device
      // Use device ID (from distribution or random) as seed for deterministic randomization
      const deviceSeed = run.id + botId;
      const warmUpSites = generateWarmUpSites(deviceSeed);
      const referrer = generateReferrer(deviceSeed);
      const sessionSeed = `${deviceSeed}-${sessionNum}`;
      const ctrEnabled = Math.random() < 0.1; // 10% of sessions simulate CTR
      
      // Realistic interactions distribution:
      // 45% - NO interactions (just visit the page like normal person)
      // 55% - 1-6 random interactions (scroll, tap, swipe)
      const interactionRoll = Math.random();
      const swipeCount = interactionRoll < 0.45 
        ? 0 
        : 1 + Math.floor(Math.random() * 6); // 1-6 swipes for 55%

      // If assignedWorkerIds are specified, distribute jobs round-robin across workers
      // Otherwise, leave unassigned so any worker can claim them
      const assignedWorkerId = 
        assignedWorkerIds.length > 0 
          ? assignedWorkerIds[jobCount % assignedWorkerIds.length]
          : undefined;

      jobs.push({
        id: jobId,
        botId,
        sessionNumber: sessionNum,
        runId: run.id,
        scheduledTime,
        status: 'pending',
        assignedWorkerId,
        warmUpSites,
        referrer,
        sessionSeed,
        ctrEnabled,
        swipeCount,
      });
      
      jobCount++;
    }
  }

  // If we have a distribution matrix, shuffle and assign distribution
  if (distributionMatrix) {
    // Create a flat list of all combinations with their counts
    const flatCombinations: Array<{ entry: DistributionMatrixEntry; index: number }> = [];
    let globalIndex = 0;
    for (const entry of distributionMatrix.entries) {
      for (let i = 0; i < entry.count; i++) {
        flatCombinations.push({ entry, index: globalIndex });
        globalIndex++;
      }
    }
    
    // Shuffle the combinations to ensure diversity
    for (let i = flatCombinations.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flatCombinations[i], flatCombinations[j]] = [flatCombinations[j], flatCombinations[i]];
    }
    
    // Reassign distribution to jobs in shuffled order
    for (let i = 0; i < jobs.length && i < flatCombinations.length; i++) {
      const combination = flatCombinations[i].entry;
      jobs[i].distribution = {
        country: combination.country,
        deviceType: combination.deviceType,
        deviceName: combination.deviceName,
        browserType: combination.browserType,
      };
    }
    
    console.log(`✅ Distribution assignments shuffled for diversity`);
  }

  // Sort by scheduled time
  jobs.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

  // Add jobs to DynamoDB in batches
  const batchSize = 25;
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    await Promise.all(
      batch.map((job) => {
        const nowISO = new Date().toISOString();
        const item: any = {
          PK: `JOB#${job.id}`,
          SK: 'META',
          jobId: job.id,
          botId: job.botId,
          sessionNumber: job.sessionNumber,
          runId: job.runId,
          scheduledTime: job.scheduledTime.toISOString(),
          status: job.status,
          createdAt: nowISO,
          updatedAt: nowISO,
          GSI1PK: `STATUS#${job.status}`,
          GSI1SK: job.scheduledTime.toISOString(),
          GSI2PK: `RUN#${job.runId}`,
          GSI2SK: job.scheduledTime.toISOString(),
          // Include assigned worker ID if present (for directing to specific workers)
          assignedWorkerId: job.assignedWorkerId || null,
          assignedAt: null, // Will be set when worker claims the job
          // Realistic session fields
          warmUpSites: job.warmUpSites || [],
          referrer: job.referrer || '',
          sessionSeed: job.sessionSeed || '',
          ctrEnabled: job.ctrEnabled || false,
          swipeCount: job.swipeCount || 10,
        };

        // Include distribution assignment if present
        if (job.distribution) {
          item.distribution = job.distribution;
        }

        return ddbDocClient.send(
          new PutCommand({
            TableName: JOBS_TABLE,
            Item: item,
          })
        );
      })
    );
    if (i + batchSize < jobs.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  console.log(`✅ Added ${jobs.length} jobs to DynamoDB queue for run ${run.id}`);
  if (assignedWorkerIds.length > 0) {
    console.log(`   📍 Jobs distributed across workers: ${assignedWorkerIds.join(', ')}`);
  }
}
