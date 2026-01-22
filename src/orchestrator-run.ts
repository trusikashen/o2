/**
 * Orchestrator that creates jobs for a specific run from DynamoDB
 * This can be called from the frontend API to create jobs for a run
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { addBulkJobs, getQueueStatsByRunId } from './queue/dynamodb-queue';
import { SessionJob } from './types';
import { random } from './utils/helpers';
import type { AdsterraRun, AdsterraConfig } from './types';
import {
  DEFAULT_DISTRIBUTION,
  calculateDistributionMatrix,
  getCombinationFromMatrix,
  validateDistributionConfig,
  type DistributionConfig,
  type DistributionMatrix,
  type DistributionMatrixEntry,
} from './config/distribution';

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

export async function createJobsForRun(runId: string): Promise<void> {
  // Load run config from DynamoDB
  const run = await getAdsterraRun(runId);
  
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (run.status === 'running') {
    throw new Error(`Run ${runId} is already running`);
  }

  const config = run.config;
  
  // Validate required config fields
  if (!config.totalBots || !config.sessionsPerBot) {
    throw new Error(`Run ${runId} is missing required config: totalBots=${config.totalBots}, sessionsPerBot=${config.sessionsPerBot}`);
  }

  const jobs: SessionJob[] = [];
  const now = Date.now();
  
  // Determine pacing duration based on pacing mode
  const pacingMode = config.pacingMode || 'human';
  let pacingDurationHours: number;
  let pacingDurationMs: number;
  
  if (pacingMode === 'fast') {
    // Fast mode: Complete as quickly as possible (still schedule, but worker processes immediately)
    pacingDurationHours = 1; // Minimal spread for fast mode
    pacingDurationMs = pacingDurationHours * 60 * 60 * 1000;
  } else {
    // Human mode: Random duration between 12-24 hours for natural variation
    pacingDurationHours = 12 + Math.random() * 12; // Random between 12-24 hours
    pacingDurationMs = pacingDurationHours * 60 * 60 * 1000;
    console.log(`📅 Human pacing: Spreading jobs across ${pacingDurationHours.toFixed(1)} hours (random 12-24h window)`);
  }

  const totalBots = config.totalBots;
  const sessionsPerBot = config.sessionsPerBot;
  const totalSessions = totalBots * sessionsPerBot;

  console.log(`Creating ${totalBots} bots with ${sessionsPerBot} sessions each for run ${runId}...`);
  console.log(`Total sessions: ${totalSessions}`);

  // Handle distribution if configured
  let distributionMatrix: DistributionMatrix | null = null;
  if (config.distribution) {
    console.log('📊 Distribution config found, calculating distribution matrix...');
    
    // Validate distribution config
    const validation = validateDistributionConfig(config.distribution);
    if (!validation.valid) {
      throw new Error(`Invalid distribution config: ${validation.errors.join(', ')}`);
    }
    
    // Calculate distribution matrix
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

  let jobIndex = 0;
  for (let botIndex = 0; botIndex < totalBots; botIndex++) {
    const botId = `bot-${String(botIndex).padStart(5, '0')}`;

    for (let sessionNum = 1; sessionNum <= sessionsPerBot; sessionNum++) {
      // Calculate base time for this session (spread across pacing duration)
      const sessionProgress = (sessionNum - 1) / sessionsPerBot;
      const baseDelay = sessionProgress * pacingDurationMs;

      // Add random offset (0-10 minutes) to stagger launches
      const randomOffset = random(0, 10 * 60 * 1000);

      // Add bot index offset to spread bots across time
      const botOffset = (botIndex / totalBots) * (pacingDurationMs / sessionsPerBot);

      const scheduledTime = new Date(now + baseDelay + randomOffset + botOffset);

      const job: SessionJob = {
        id: `${runId}-${botId}-session-${sessionNum}`,
        botId,
        sessionNumber: sessionNum,
        runId, // Associate with run
        scheduledTime,
        status: 'pending',
      };

      // Distribution will be assigned after all jobs are created (to ensure diversity)
      // We'll assign it later by shuffling the matrix entries

      jobs.push(job);
      jobIndex++;
    }
  }

  // If we have a distribution matrix, shuffle the distribution assignments
  // to ensure diversity across jobs (avoid clustering all USA+Chrome together)
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

  // Add jobs to DynamoDB queue
  console.log(`Adding ${jobs.length} jobs to DynamoDB queue...`);
  await addBulkJobs(jobs);
  console.log(`✅ Added ${jobs.length} jobs to DynamoDB queue for run ${runId}`);

  // Show queue stats for this run
  const stats = await getQueueStatsByRunId(runId);
  console.log('');
  console.log(`Queue Stats for run ${runId}:`);
  console.log(`  Waiting: ${stats.waiting}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Completed: ${stats.completed}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Total: ${stats.total}`);
}
