/**
 * Test script for job scheduling logic
 * 
 * This script verifies that:
 * 1. Jobs scheduled for the future are NOT executed immediately in 'human' pacing mode
 * 2. Jobs scheduled for the past are executed in both modes
 * 3. Fast mode ignores scheduled times
 * 4. Human mode respects scheduled times
 * 
 * Run with: npx tsx src/__tests__/scheduling.test.ts
 */

import 'dotenv/config';
import { getNextJob, getNextJobForRun, addJob } from '../queue/dynamodb-queue';
import type { SessionJob } from '../types';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTestJob(id: string, scheduledTime: Date, runId: string = 'test-run'): SessionJob {
  return {
    id,
    botId: 'test-bot',
    sessionNumber: 1,
    runId,
    scheduledTime,
    status: 'pending',
    warmUpSites: [],
    referrer: '',
    sessionSeed: '',
    ctrEnabled: false,
    swipeCount: 10,
  };
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
  console.log('\n🧪 Running Scheduling Tests...\n');
  
  // Test 1: Job scheduled in the past should be returned in human mode
  await test('getNextJob: Return job scheduled in past (human mode)', async () => {
    const pastTime = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const testJob = createTestJob(`test-past-${Date.now()}-${Math.random()}`, pastTime);
    
    await addJob(testJob);
    
    // Give DynamoDB time to write
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // With ignoreScheduledTime=false (human mode behavior)
    const job = await getNextJob(false);
    
    // Job might be null if no jobs in queue, but if returned it should be past
    if (job) {
      assert(job.scheduledTime <= new Date(), 'Returned job should be scheduled in past or now');
    }
  });
  
  // Test 2: Job scheduled in the future should NOT be returned in human mode
  await test('getNextJob: Skip job scheduled in future (human mode)', async () => {
    const futureTime = new Date(Date.now() + 30 * 1000); // 30 seconds in future
    const testJob = createTestJob(`test-future-${Date.now()}`, futureTime);
    
    await addJob(testJob);
    
    // With ignoreScheduledTime=false (human mode behavior)
    const job = await getNextJob(false);
    
    // Job might be null or might be a different job, but if it's returned, it should not be this future job
    if (job && job.id === testJob.id) {
      throw new Error('Should NOT return job scheduled in future');
    }
  });
  
  // Test 3: Job scheduled in the future SHOULD be returned in fast mode
  await test('getNextJob: Return job scheduled in future (fast mode)', async () => {
    const futureTime = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes in future
    const testJob = createTestJob(`test-future-fast-${Date.now()}`, futureTime);
    
    await addJob(testJob);
    
    // With ignoreScheduledTime=true (fast mode behavior)
    const job = await getNextJob(true);
    
    assert(job !== null, 'Should return a job in fast mode');
  });
  
  // Test 4: Run-specific query respects scheduled time in human mode
  await test('getNextJobForRun: Return job scheduled in past (human mode)', async () => {
    const runId = `test-run-${Date.now()}`;
    const pastTime = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    const testJob = createTestJob(`test-run-past-${Date.now()}`, pastTime, runId);
    
    await addJob(testJob);
    
    // With ignoreScheduledTime=false (human mode behavior)
    const job = await getNextJobForRun(runId, false);
    
    assert(job !== null, 'Should return a job');
    if (job) {
      assert(job.runId === runId, 'Job should be from correct run');
      assert(job.scheduledTime <= new Date(), 'Job should be scheduled in past or now');
    }
  });
  
  // Test 5: Run-specific query skips future jobs in human mode
  await test('getNextJobForRun: Skip job scheduled in future (human mode)', async () => {
    const runId = `test-run-future-${Date.now()}`;
    const futureTime = new Date(Date.now() + 30 * 1000); // 30 seconds in future
    const testJob = createTestJob(`test-run-future-${Date.now()}`, futureTime, runId);
    
    await addJob(testJob);
    
    // With ignoreScheduledTime=false (human mode behavior)
    const job = await getNextJobForRun(runId, false);
    
    // Job might be null or might be a different job from this run
    if (job && job.id === testJob.id) {
      throw new Error('Should NOT return job scheduled in future');
    }
  });
  
  // Test 6: Run-specific query returns future jobs in fast mode
  await test('getNextJobForRun: Return job scheduled in future (fast mode)', async () => {
    const runId = `test-run-future-fast-${Date.now()}`;
    const futureTime = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes in future
    const testJob = createTestJob(`test-run-fast-${Date.now()}`, futureTime, runId);
    
    await addJob(testJob);
    
    // With ignoreScheduledTime=true (fast mode behavior)
    const job = await getNextJobForRun(runId, true);
    
    assert(job !== null, 'Should return a job in fast mode');
    assert(job?.runId === runId, 'Job should be from correct run');
  });
  
  // Test 7: Jobs are prioritized by scheduled time (oldest first)
  await test('Scheduling: Prioritize older scheduled times', async () => {
    const runId = `test-run-priority-${Date.now()}`;
    const pastTime1 = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago (older)
    const pastTime2 = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago (newer)
    
    const jobOlder = createTestJob(`test-older-${Date.now()}`, pastTime1, runId);
    const jobNewer = createTestJob(`test-newer-${Date.now() + 1}`, pastTime2, runId);
    
    await addJob(jobOlder);
    await addJob(jobNewer);
    
    // Should get the older job first
    const job1 = await getNextJobForRun(runId, false);
    assert(job1 !== null, 'Should return a job');
    
    // The returned job should have the older scheduled time
    if (job1) {
      assert(
        job1.scheduledTime <= jobNewer.scheduledTime,
        'Should return job with older scheduled time'
      );
    }
  });
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
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
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
