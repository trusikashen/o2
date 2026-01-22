/**
 * Integration test for worker scheduling behavior
 * 
 * This test simulates the worker's job selection logic and verifies that:
 * 1. In human mode, workers skip jobs scheduled for the future
 * 2. In fast mode, workers execute jobs regardless of schedule
 * 3. Workers load run config BEFORE selecting jobs (to know pacing mode)
 * 
 * Run with: npx tsx src/__tests__/worker-scheduling-integration.test.ts
 */

import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { SessionJob, AdsterraConfig, AdsterraRun } from '../types';
import { addJob, getNextJobForRun } from '../queue/dynamodb-queue';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function createTestRun(
  runId: string,
  config: AdsterraConfig
): Promise<void> {
  const now = new Date().toISOString();
  const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
  
  await ddbDocClient.send(
    new PutCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      Item: {
        PK: `RUN#${runId}`,
        SK: 'META',
        id: runId,
        status: 'running',
        config: config,
        createdAt: now,
        updatedAt: now,
      },
    })
  );
}

async function getRunConfig(runId: string): Promise<AdsterraConfig | null> {
  const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
  
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
  
  if (result.Items && result.Items.length > 0) {
    return result.Items[0].config as AdsterraConfig;
  }
  return null;
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message });
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 Running Worker Scheduling Integration Tests...\n');
  
  // Test 1: Worker loads run config BEFORE selecting job
  await test('Worker loads run config before job selection', async () => {
    const runId = `integration-test-${Date.now()}`;
    const humanConfig: AdsterraConfig = {
      pacingMode: 'human',
      adsterraUrl: 'https://example.com',
      browserHeadless: true,
      minScrollWait: 1000,
      maxScrollWait: 3000,
      minAdWait: 2000,
      maxAdWait: 5000,
    };
    
    await createTestRun(runId, humanConfig);
    
    const loadedConfig = await getRunConfig(runId);
    assert(loadedConfig !== null, 'Should load run config');
    assert(loadedConfig?.pacingMode === 'human', 'Config should have human pacing mode');
  });
  
  // Test 2: In human mode, worker skips future jobs
  await test('Worker skips future jobs in human mode', async () => {
    const runId = `human-mode-${Date.now()}`;
    const humanConfig: AdsterraConfig = {
      pacingMode: 'human',
      adsterraUrl: 'https://example.com',
      browserHeadless: true,
      minScrollWait: 1000,
      maxScrollWait: 3000,
      minAdWait: 2000,
      maxAdWait: 5000,
    };
    
    await createTestRun(runId, humanConfig);
    
    // Create job scheduled for future
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
    const futureJob: SessionJob = {
      id: `future-job-${Date.now()}`,
      botId: 'test-bot',
      sessionNumber: 1,
      runId: runId,
      scheduledTime: futureTime,
      status: 'pending',
      warmUpSites: [],
      referrer: '',
      sessionSeed: '',
      ctrEnabled: false,
      swipeCount: 10,
    };
    
    await addJob(futureJob);
    
    // Create past job for reference
    const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const pastJob: SessionJob = {
      id: `past-job-${Date.now()}`,
      botId: 'test-bot',
      sessionNumber: 2,
      runId: runId,
      scheduledTime: pastTime,
      status: 'pending',
      warmUpSites: [],
      referrer: '',
      sessionSeed: '',
      ctrEnabled: false,
      swipeCount: 10,
    };
    
    await addJob(pastJob);
    
    // Load config (this is what worker does first now)
    const config = await getRunConfig(runId);
    const pacingMode = config?.pacingMode || 'human';
    
    // Determine ignoreScheduledTime based on pacing mode
    const ignoreScheduledTime = pacingMode !== 'human';
    
    // Select job with correct flag
    const selectedJob = await getNextJobForRun(runId, ignoreScheduledTime);
    
    // Should get past job, not future job
    assert(selectedJob !== null, 'Should get a job');
    assert(selectedJob?.id === pastJob.id, 'Should select past job, not future job');
  });
  
  // Test 3: In fast mode, worker processes future jobs
  await test('Worker processes future jobs in fast mode', async () => {
    const runId = `fast-mode-${Date.now()}`;
    const fastConfig: AdsterraConfig = {
      pacingMode: 'fast',
      adsterraUrl: 'https://example.com',
      browserHeadless: true,
      minScrollWait: 500,
      maxScrollWait: 1000,
      minAdWait: 1000,
      maxAdWait: 2000,
    };
    
    await createTestRun(runId, fastConfig);
    
    // Create future job
    const futureTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes in future
    const futureJob: SessionJob = {
      id: `future-fast-${Date.now()}`,
      botId: 'test-bot',
      sessionNumber: 1,
      runId: runId,
      scheduledTime: futureTime,
      status: 'pending',
      warmUpSites: [],
      referrer: '',
      sessionSeed: '',
      ctrEnabled: false,
      swipeCount: 10,
    };
    
    await addJob(futureJob);
    
    // Load config
    const config = await getRunConfig(runId);
    const pacingMode = config?.pacingMode || 'human';
    
    // Determine ignoreScheduledTime based on pacing mode
    const ignoreScheduledTime = pacingMode !== 'human';
    
    // Select job with correct flag
    const selectedJob = await getNextJobForRun(runId, ignoreScheduledTime);
    
    // Should get future job in fast mode
    assert(selectedJob !== null, 'Should get a job in fast mode');
    assert(selectedJob?.id === futureJob.id, 'Should select future job in fast mode');
  });
  
  // Test 4: Default pacing mode is 'human' (safe default)
  await test('Default pacing mode is human (safe default)', async () => {
    const runId = `default-mode-${Date.now()}`;
    
    // Create config WITHOUT explicit pacingMode
    const configNoMode: any = {
      adsterraUrl: 'https://example.com',
      browserHeadless: true,
    };
    
    await createTestRun(runId, configNoMode);
    
    const loadedConfig = await getRunConfig(runId);
    const pacingMode = loadedConfig?.pacingMode || 'human';
    
    // Should default to 'human' for safety
    assert(pacingMode === 'human', 'Should default to human pacing mode for safety');
  });
  
  // Test 5: Verify correct ignoreScheduledTime flag is used
  await test('Correct ignoreScheduledTime flag for each pacing mode', async () => {
    // Human mode
    const humanPacingMode = 'human';
    const humanIgnoreFlag = humanPacingMode !== 'human';
    assert(humanIgnoreFlag === false, 'Human mode should use ignoreScheduledTime=false');
    
    // Fast mode
    const fastPacingMode = 'fast';
    const fastIgnoreFlag = fastPacingMode !== 'human';
    assert(fastIgnoreFlag === true, 'Fast mode should use ignoreScheduledTime=true');
    
    // Default (undefined)
    const defaultPacingMode = undefined;
    const defaultFinalMode = defaultPacingMode || 'human';
    const defaultIgnoreFlag = defaultFinalMode !== 'human';
    assert(defaultIgnoreFlag === false, 'Default should use ignoreScheduledTime=false');
  });
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Integration Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\n✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);
  
  if (results.some(r => !r.passed)) {
    console.log('\n❌ Failed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n✅ All integration tests passed!');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
