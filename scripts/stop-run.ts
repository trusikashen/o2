/**
 * Stop a run and optionally clean up pending jobs
 * Usage: tsx scripts/stop-run.ts <runId> [--cleanup-jobs]
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';

// Load .env
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function stopRun(runId: string, cleanupJobs: boolean) {
  console.log('\n' + '='.repeat(60));
  console.log(`🛑 Stopping Run: ${runId}`);
  console.log('='.repeat(60) + '\n');

  try {
    // Update run status to 'stopped'
    await ddbDocClient.send(
      new UpdateCommand({
        TableName: ADSTERRA_RUNS_TABLE,
        Key: {
          PK: `RUN#${runId}`,
          SK: 'META',
        },
        UpdateExpression: 'SET #status = :stopped, updatedAt = :now',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':stopped': 'stopped',
          ':now': new Date().toISOString(),
        },
      })
    );

    console.log('✅ Run status updated to "stopped"\n');

    if (cleanupJobs) {
      console.log('🧹 Cleaning up pending jobs for this run...\n');
      
      // Get all pending jobs for this run
      // Use GSI1 (status index) and filter by runId since GSI2 might not exist
      let pendingJobs: any[] = [];
      let lastEvaluatedKey: any = undefined;
      
      do {
        try {
          const result = await ddbDocClient.send(
            new QueryCommand({
              TableName: JOBS_TABLE,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :status',
              FilterExpression: 'runId = :runId',
              ExpressionAttributeValues: {
                ':status': 'STATUS#pending',
                ':runId': runId,
              },
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );

          if (result.Items) {
            pendingJobs = pendingJobs.concat(result.Items);
          }
          lastEvaluatedKey = result.LastEvaluatedKey;
        } catch (error: any) {
          // Fallback: Use scan if GSI1 doesn't work
          if (error.name === 'ValidationException') {
            console.log('   ⚠️  GSI1 not available, using scan (slower)...\n');
            const scanResult = await ddbDocClient.send(
              new QueryCommand({
                TableName: JOBS_TABLE,
                FilterExpression: 'runId = :runId AND #status = :status',
                ExpressionAttributeNames: {
                  '#status': 'status',
                },
                ExpressionAttributeValues: {
                  ':runId': runId,
                  ':status': 'pending',
                },
                ExclusiveStartKey: lastEvaluatedKey,
              })
            );
            if (scanResult.Items) {
              pendingJobs = pendingJobs.concat(scanResult.Items);
            }
            lastEvaluatedKey = scanResult.LastEvaluatedKey;
          } else {
            throw error;
          }
        }
      } while (lastEvaluatedKey);

      console.log(`   Found ${pendingJobs.length} pending jobs to delete\n`);

      // Delete in batches of 25 (DynamoDB limit)
      const batchSize = 25;
      let deleted = 0;
      
      for (let i = 0; i < pendingJobs.length; i += batchSize) {
        const batch = pendingJobs.slice(i, i + batchSize);
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: {
              PK: item.PK,
              SK: item.SK,
            },
          },
        }));

        await ddbDocClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [JOBS_TABLE]: deleteRequests,
            },
          })
        );

        deleted += batch.length;
        console.log(`   Deleted ${deleted}/${pendingJobs.length} jobs...`);
      }

      console.log(`\n✅ Deleted ${deleted} pending jobs\n`);
    } else {
      console.log('ℹ️  Pending jobs left in queue (use --cleanup-jobs to delete them)\n');
    }

    console.log('✅ Run stopped successfully!\n');
    console.log('💡 Next steps:');
    console.log('   1. Stop the worker: pm2 stop adsterra-worker');
    console.log('   2. Create a new run from the frontend');
    console.log('   3. Start the new run from the frontend');
    console.log('   4. Restart the worker: pm2 start adsterra-worker\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Parse command line arguments
const runId = process.argv[2];
const cleanupJobs = process.argv.includes('--cleanup-jobs');

if (!runId) {
  console.error('❌ Please provide a run ID');
  console.log('Usage: tsx scripts/stop-run.ts <runId> [--cleanup-jobs]');
  console.log('Example: tsx scripts/stop-run.ts 5eae5200-9864-442b-a4da-da4a7777a5ae --cleanup-jobs');
  process.exit(1);
}

stopRun(runId, cleanupJobs);

