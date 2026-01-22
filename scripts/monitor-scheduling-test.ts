/**
 * Monitor script: Track job execution against scheduled times
 * 
 * This script monitors how jobs are being executed and verifies they respect schedule
 * 
 * Run with: npx tsx scripts/monitor-scheduling-test.ts
 */

import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

interface JobData {
  id: string;
  scheduledTime: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

async function getRecentTestRun(): Promise<string | null> {
  const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
  
  const result = await ddbDocClient.send(
    new ScanCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      FilterExpression: 'begins_with(id, :prefix)',
      ExpressionAttributeValues: {
        ':prefix': 'test-human-',
      },
      Limit: 1,
    })
  );
  
  if (result.Items && result.Items.length > 0) {
    const run = result.Items[0] as any;
    return run.id;
  }
  
  return null;
}

async function getJobsByRun(runId: string): Promise<JobData[]> {
  const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';
  
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :runId',
      ExpressionAttributeValues: {
        ':runId': `RUN#${runId}`,
      },
      Limit: 100,
    })
  );
  
  if (!result.Items) {
    return [];
  }
  
  return result.Items.map(item => ({
    id: item.jobId,
    scheduledTime: item.scheduledTime,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  })) as JobData[];
}

async function analyzeJobExecution(jobs: JobData[]): Promise<void> {
  console.log('\n📊 JOB EXECUTION ANALYSIS');
  console.log('='.repeat(100));
  
  // Sort by scheduled time
  const sortedJobs = [...jobs].sort(
    (a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
  );
  
  // Analyze each job
  let onTimeCount = 0;
  let earlyCount = 0;
  let lateCount = 0;
  let pendingCount = 0;
  
  console.log('\nJob Status:');
  console.log('─'.repeat(100));
  
  for (const job of sortedJobs) {
    const scheduledTime = new Date(job.scheduledTime).getTime();
    const executedTime = job.updatedAt ? new Date(job.updatedAt).getTime() : null;
    const now = Date.now();
    
    let statusEmoji = '';
    let analysis = '';
    
    if (job.status === 'pending') {
      statusEmoji = '⏳';
      const timeUntil = (scheduledTime - now) / 1000 / 60;
      analysis = `Waiting (${timeUntil > 0 ? '+' : ''}${timeUntil.toFixed(1)}min)`;
      pendingCount++;
    } else if (job.status === 'completed' || job.status === 'active') {
      if (executedTime && executedTime < scheduledTime) {
        statusEmoji = '❌'; // Executed BEFORE schedule
        const diff = (scheduledTime - executedTime) / 1000 / 60;
        analysis = `EARLY by ${diff.toFixed(1)}min - VIOLATION!`;
        earlyCount++;
      } else if (executedTime && executedTime >= scheduledTime) {
        statusEmoji = '✅'; // Executed on time or after
        const diff = (executedTime - scheduledTime) / 1000 / 60;
        analysis = `On-time (${diff > 0 ? '+' : ''}${diff.toFixed(1)}min)`;
        onTimeCount++;
      } else if (job.status === 'completed') {
        statusEmoji = '✅';
        analysis = 'Completed';
        onTimeCount++;
      }
    } else if (job.status === 'failed') {
      statusEmoji = '⚠️';
      analysis = 'Failed';
    }
    
    const jobNum = sortedJobs.indexOf(job) + 1;
    const scheduledStr = new Date(scheduledTime).toLocaleTimeString();
    const executedStr = executedTime ? new Date(executedTime).toLocaleTimeString() : 'N/A';
    
    console.log(`${statusEmoji} Job ${jobNum.toString().padStart(2, '0')}: ${scheduledStr} → ${executedStr} | ${analysis}`);
  }
  
  console.log('─'.repeat(100));
  
  // Summary
  console.log('\n📈 SUMMARY');
  console.log('─'.repeat(100));
  console.log(`✅ On-time: ${onTimeCount}/${jobs.length}`);
  console.log(`❌ Early (VIOLATION): ${earlyCount}/${jobs.length}`);
  console.log(`⚠️  Late: ${lateCount}/${jobs.length}`);
  console.log(`⏳ Pending: ${pendingCount}/${jobs.length}`);
  
  // Assessment
  console.log('\n🎯 ASSESSMENT');
  console.log('─'.repeat(100));
  
  if (earlyCount === 0 && onTimeCount > 0) {
    console.log('✅ SCHEDULING FIX IS WORKING!');
    console.log('   - No jobs executed before schedule');
    console.log('   - All executed jobs respect scheduled times');
    console.log('   - Worker is following human mode correctly!');
  } else if (earlyCount > 0) {
    console.log('❌ SCHEDULING ISSUE DETECTED!');
    console.log(`   - ${earlyCount} jobs executed BEFORE their scheduled time`);
    console.log('   - This is the bug we fixed - worker should not do this!');
  } else {
    console.log('⏳ TEST STILL RUNNING');
    console.log(`   - ${pendingCount} jobs pending`);
    console.log('   - Wait for scheduled times to arrive');
  }
  
  console.log('\n' + '='.repeat(100) + '\n');
}

async function main() {
  console.log('\n' + '='.repeat(100));
  console.log('📡 SCHEDULING TEST MONITOR');
  console.log('='.repeat(100));
  
  try {
    // Find most recent test run
    console.log('\nSearching for test run...');
    const runId = await getRecentTestRun();
    
    if (!runId) {
      console.log('❌ No test run found!');
      console.log('   First run: npx tsx scripts/create-scheduling-test-jobs.ts');
      process.exit(1);
    }
    
    console.log(`✅ Found test run: ${runId}`);
    
    // Get jobs
    console.log('\nFetching job data...');
    const jobs = await getJobsByRun(runId);
    
    if (jobs.length === 0) {
      console.log('❌ No jobs found for this run!');
      process.exit(1);
    }
    
    console.log(`✅ Found ${jobs.length} jobs`);
    
    // Analyze execution
    await analyzeJobExecution(jobs);
    
    // Refresh interval
    console.log('💡 Tip: Run this command again in a moment to see updated status\n');
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
