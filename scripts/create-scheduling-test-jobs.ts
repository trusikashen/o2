/**
 * Test script: Create 20 jobs in human mode over 30 minutes
 * 
 * This script:
 * 1. Creates a run in human pacing mode
 * 2. Creates 20 jobs scheduled over 30 minutes (1.5 min interval)
 * 3. Each job targets ipleak.com without proxy
 * 4. Prints job schedule so you can monitor worker execution
 * 
 * Run with: npx tsx scripts/create-scheduling-test-jobs.ts
 * 
 * Then start worker: npm run worker:once
 * 
 * Worker should execute jobs ONLY when scheduled time arrives!
 */

import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { addJob, addBulkJobs } from '../src/queue/dynamodb-queue';
import type { SessionJob, AdsterraConfig } from '../src/types';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function createTestRun(): Promise<string> {
  const runId = `test-human-${Date.now()}`;
  const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
  const now = new Date().toISOString();
  
  // Create run with HUMAN pacing mode (strict scheduling!)
  const config: AdsterraConfig = {
    pacingMode: 'human', // ← STRICT SCHEDULING
    adsterraUrl: 'https://ipleak.com',
    browserHeadless: true,
    minScrollWait: 3000,
    maxScrollWait: 5000,
    minAdWait: 2000,
    maxAdWait: 4000,
  };
  
  await ddbDocClient.send(
    new PutCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      Item: {
        PK: `RUN#${runId}`,
        SK: 'META',
        id: runId,
        status: 'running',
        config,
        createdAt: now,
        updatedAt: now,
      },
    })
  );
  
  return runId;
}

async function createTestJobs(runId: string): Promise<SessionJob[]> {
  const jobs: SessionJob[] = [];
  const startTime = Date.now();
  const jobCount = 20;
  const intervalMs = 1.5 * 60 * 1000; // 1.5 minutes between jobs
  
  console.log('\n📋 Creating 20 jobs scheduled over 30 minutes...\n');
  console.log(`Start time: ${new Date(startTime).toISOString()}`);
  console.log(`Interval: 1.5 minutes between jobs`);
  console.log(`Total duration: ${(jobCount * intervalMs) / 1000 / 60} minutes\n`);
  console.log('Job Schedule:');
  console.log('─'.repeat(90));
  
  for (let i = 0; i < jobCount; i++) {
    // Schedule each job 1.5 minutes apart
    const scheduledTime = new Date(startTime + i * intervalMs);
    const jobId = `ipleak-test-${Date.now()}-${i}`;
    
    const job: SessionJob = {
      id: jobId,
      botId: 'ipleak-bot',
      sessionNumber: i + 1,
      runId,
      scheduledTime,
      status: 'pending',
      warmUpSites: ['https://ipleak.com'],
      referrer: 'https://google.com',
      sessionSeed: `session-${i}`,
      ctrEnabled: false,
      swipeCount: 5,
    };
    
    jobs.push(job);
    
    // Print schedule
    const timeFromNow = (scheduledTime.getTime() - startTime) / 1000 / 60;
    console.log(`  Job ${(i + 1).toString().padStart(2, '0')}: ${scheduledTime.toISOString()} (+${timeFromNow.toFixed(1)}m)`);
  }
  
  console.log('─'.repeat(90));
  console.log(`\n✅ Adding ${jobCount} jobs to queue...\n`);
  
  // Add jobs to DynamoDB
  await addBulkJobs(jobs);
  
  return jobs;
}

async function main() {
  console.log('\n' + '='.repeat(90));
  console.log('🧪 SCHEDULING TEST: 20 Jobs in Human Mode Over 30 Minutes');
  console.log('='.repeat(90));
  console.log('\n📍 Target: ipleak.com (no proxy)');
  console.log('📝 Pacing Mode: HUMAN (strict scheduling)');
  console.log('⏱️  Duration: 30 minutes');
  console.log('🔢 Job Count: 20');
  
  try {
    // 1. Create run
    console.log('\n[Step 1] Creating run with human pacing mode...');
    const runId = await createTestRun();
    console.log(`✅ Run created: ${runId}`);
    
    // 2. Create jobs
    console.log('\n[Step 2] Creating jobs with 1.5-minute intervals...');
    const jobs = await createTestJobs(runId);
    
    console.log(`✅ ${jobs.length} jobs created successfully!\n`);
    
    // 3. Print instructions
    console.log('='.repeat(90));
    console.log('🚀 NEXT STEPS - HOW TO TEST');
    console.log('='.repeat(90));
    
    console.log('\n1️⃣  Start the worker (in a NEW terminal):');
    console.log('   npm run worker:once\n');
    
    console.log('2️⃣  Watch the logs carefully:');
    console.log('   ✅ Worker should START executing jobs starting at first scheduled time');
    console.log('   ✅ Each job should execute AT its scheduled time (not before!)');
    console.log('   ✅ Should see "Session X: Completed" messages\n');
    
    console.log('3️⃣  What to look for:');
    console.log(`   📋 Loaded config for run: ${runId.substring(0, 8)}... (Status: running, Pacing: human)`);
    console.log('   ⏰ Job scheduled for future... (if worker picks up future job - BAD!)')
    console.log('   ✅ Session 1: Completed in Xs (if at right time - GOOD!)\n');
    
    console.log('4️⃣  Monitor the execution:');
    console.log('   npm run check:queue\n');
    
    console.log('='.repeat(90));
    console.log('📊 EXPECTED BEHAVIOR');
    console.log('='.repeat(90));
    
    console.log('\n⏰ Timeline Example:');
    const now = new Date();
    console.log(`   Now: ${now.toISOString()}`);
    console.log(`   Job 1 scheduled: ${jobs[0].scheduledTime.toISOString()}`);
    console.log(`   → If current time < scheduled time → Worker WAITS ✅`);
    console.log(`   → When time arrives → Worker EXECUTES ✅`);
    console.log(`   → Worker should NOT execute before time ❌\n`);
    
    console.log('='.repeat(90));
    console.log('✅ TEST SETUP COMPLETE!');
    console.log('='.repeat(90));
    console.log(`\n📌 Run ID: ${runId}`);
    console.log(`📌 Job Count: ${jobs.length}`);
    console.log(`📌 Start Time: ${jobs[0].scheduledTime.toISOString()}`);
    console.log(`📌 End Time: ${jobs[jobs.length - 1].scheduledTime.toISOString()}`);
    
    console.log('\n🎯 This test will verify that scheduling fix is working!\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
