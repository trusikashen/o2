/**
 * Stop ALL runs in DynamoDB and optionally wipe ALL jobs and/or delete ALL runs.
 *
 * Usage:
 *   tsx scripts/stop-all-runs.ts                    # Stop all runs
 *   tsx scripts/stop-all-runs.ts --wipe-jobs        # Stop runs + delete all jobs
 *   tsx scripts/stop-all-runs.ts --delete-runs      # Stop runs + delete all runs
 *   tsx scripts/stop-all-runs.ts --wipe-jobs --delete-runs  # Delete everything
 *
 * Notes:
 * - This is the "big red button" to halt everything.
 * - Stop the worker first: pm2 stop adsterra-worker
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

// Load .env
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function scanAllItems(tableName: string): Promise<any[]> {
  const items: any[] = [];
  let lastEvaluatedKey: any = undefined;

  do {
    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );
    if (result.Items) items.push(...result.Items);
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return items;
}

async function batchDeleteAll(tableName: string, keys: Array<{ PK: string; SK: string }>) {
  const batchSize = 25;
  let deleted = 0;

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    await ddbDocClient.send(
      new BatchWriteCommand({
        RequestItems: {
          [tableName]: batch.map((k) => ({
            DeleteRequest: { Key: k },
          })),
        },
      })
    );
    deleted += batch.length;
    console.log(`   Deleted ${deleted}/${keys.length} from ${tableName}...`);
  }
}

async function stopAllRuns(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🛑 Stopping ALL runs');
  console.log('='.repeat(60) + '\n');

  const now = new Date().toISOString();

  // Stop all run META items
  const runs = await ddbDocClient.send(
    new ScanCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'META' },
    })
  );

  const items = runs.Items || [];
  console.log(`Found ${items.length} run(s) to stop.`);

  for (const item of items) {
    const runId = item.id;
    if (!runId) continue;
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ADSTERRA_RUNS_TABLE,
        Key: { PK: `RUN#${runId}`, SK: 'META' },
        UpdateExpression: 'SET #status = :stopped, updatedAt = :now',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':stopped': 'stopped', ':now': now },
      })
    );
  }

  console.log('✅ All runs marked as stopped.\n');
}

async function wipeAllJobs(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🧹 Wiping ALL jobs (AdsterraJobs)');
  console.log('='.repeat(60) + '\n');

  const allJobs = await scanAllItems(JOBS_TABLE);
  if (allJobs.length === 0) {
    console.log('✅ No jobs to delete.\n');
    return;
  }

  const keys = allJobs
    .map((j) => ({ PK: j.PK, SK: j.SK }))
    .filter((k) => typeof k.PK === 'string' && typeof k.SK === 'string');

  console.log(`Found ${keys.length} job item(s) to delete.`);
  await batchDeleteAll(JOBS_TABLE, keys);
  console.log('\n✅ All jobs deleted.\n');
}

async function deleteAllRuns(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🗑️  Deleting ALL runs (AdsterraRuns)');
  console.log('='.repeat(60) + '\n');

  const allRuns = await scanAllItems(ADSTERRA_RUNS_TABLE);
  if (allRuns.length === 0) {
    console.log('✅ No runs to delete.\n');
    return;
  }

  const keys = allRuns
    .map((r) => ({ PK: r.PK, SK: r.SK }))
    .filter((k) => typeof k.PK === 'string' && typeof k.SK === 'string');

  console.log(`Found ${keys.length} run item(s) to delete.`);
  await batchDeleteAll(ADSTERRA_RUNS_TABLE, keys);
  console.log('\n✅ All runs deleted.\n');
}

async function main() {
  const wipeJobs = process.argv.includes('--wipe-jobs');

  try {
    await stopAllRuns();
    if (wipeJobs) {
      await wipeAllJobs();
    } else {
      console.log('ℹ️  Jobs were not deleted. Use --wipe-jobs to wipe the queue.');
    }

    console.log('\n✨ Done.');
    console.log('Next: create a new run from the frontend and start the worker again.');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();


