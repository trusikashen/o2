import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function inspectRun(runId: string) {
  console.log('='.repeat(80));
  console.log(`🔍 Inspecting Run: ${runId}`);
  console.log('='.repeat(80));
  console.log('');

  // Get run config
  console.log('📋 Run Configuration:');
  console.log('-'.repeat(80));
  try {
    const runResult = await ddbDocClient.send(
      new QueryCommand({
        TableName: ADSTERRA_RUNS_TABLE,
        KeyConditionExpression: 'PK = :pk AND SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `RUN#${runId}`,
          ':sk': 'META',
        },
      })
    );

    if (!runResult.Items || runResult.Items.length === 0) {
      console.log(`❌ Run ${runId} not found in DynamoDB`);
      return;
    }

    const run = runResult.Items[0];
    console.log(`Name: ${run.name}`);
    console.log(`Status: ${run.status}`);
    console.log(`Created: ${run.createdAt}`);
    console.log('');

    console.log('Config:');
    console.log(JSON.stringify(run.config, null, 2));
    console.log('');

    // Check for distribution config
    if (run.config.distribution) {
      console.log('✅ Distribution Config Found:');
      console.log(JSON.stringify(run.config.distribution, null, 2));
    } else {
      console.log('⚠️  NO DISTRIBUTION CONFIG FOUND IN RUN');
      console.log('   This means jobs will use random selection (defaulting to USA)');
    }
    console.log('');

    // Get jobs
    console.log('📊 Jobs:');
    console.log('-'.repeat(80));
    
    let allJobs: any[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const jobsResult = await ddbDocClient.send(
        new QueryCommand({
          TableName: JOBS_TABLE,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :runId',
          ExpressionAttributeValues: {
            ':runId': `RUN#${runId}`,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (jobsResult.Items) {
        allJobs = allJobs.concat(jobsResult.Items);
      }
      lastEvaluatedKey = jobsResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`Total Jobs: ${allJobs.length}`);
    console.log('');

    // Count by status
    const statusCounts: Record<string, number> = {};
    const distributionCounts: Record<string, number> = {};
    let jobsWithDistribution = 0;
    let jobsWithoutDistribution = 0;

    for (const job of allJobs) {
      const status = job.status || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      if (job.distribution) {
        jobsWithDistribution++;
        const key = `${job.distribution.country}-${job.distribution.deviceType}-${job.distribution.browserType}`;
        distributionCounts[key] = (distributionCounts[key] || 0) + 1;
      } else {
        jobsWithoutDistribution++;
      }
    }

    console.log('Status Breakdown:');
    for (const [status, count] of Object.entries(statusCounts)) {
      console.log(`  ${status}: ${count}`);
    }
    console.log('');

    console.log('Distribution Assignment:');
    console.log(`  ✅ Jobs WITH distribution: ${jobsWithDistribution}`);
    console.log(`  ❌ Jobs WITHOUT distribution: ${jobsWithoutDistribution}`);
    console.log('');

    if (jobsWithDistribution > 0) {
      console.log('Distribution Breakdown:');
      for (const [key, count] of Object.entries(distributionCounts)) {
        console.log(`  ${key}: ${count}`);
      }
      console.log('');
    }

    // Show first 10 jobs with details
    console.log('Sample Jobs (first 10):');
    console.log('-'.repeat(80));
    for (let i = 0; i < Math.min(10, allJobs.length); i++) {
      const job = allJobs[i];
      console.log(`Job ${i + 1}: ${job.id}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Bot: ${job.botId}, Session: ${job.sessionNumber}`);
      if (job.distribution) {
        console.log(`  ✅ Distribution: ${job.distribution.country} + ${job.distribution.deviceType} + ${job.distribution.browserType} (${job.distribution.deviceName})`);
      } else {
        console.log(`  ❌ No distribution assignment`);
      }
      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('📊 Summary:');
    console.log('='.repeat(80));
    console.log(`Run has distribution config: ${run.config.distribution ? '✅ YES' : '❌ NO'}`);
    console.log(`Jobs with distribution: ${jobsWithDistribution} / ${allJobs.length}`);
    console.log(`Jobs without distribution: ${jobsWithoutDistribution} / ${allJobs.length}`);
    
    if (!run.config.distribution) {
      console.log('');
      console.log('⚠️  ISSUE: Run has no distribution config, so jobs will use random selection');
    } else if (jobsWithoutDistribution > 0) {
      console.log('');
      console.log('⚠️  ISSUE: Some jobs are missing distribution assignments');
      console.log('   This could mean jobs were created before distribution was saved');
    } else {
      console.log('');
      console.log('✅ All jobs have distribution assignments!');
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Get runId from command line args
const runId = process.argv[2];

if (!runId) {
  console.error('Usage: tsx scripts/inspect-run.ts <runId>');
  process.exit(1);
}

inspectRun(runId).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

