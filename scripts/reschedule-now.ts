/**
 * Reschedule all pending tasks to start NOW
 * Usage: npx ts-node scripts/reschedule-now.ts
 */

import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDB({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamodb = DynamoDBDocumentClient.from(client);

async function rescheduleTasksToNow() {
  console.log('🔄 Пересоздание всех задач на ТЕКУЩЕЕ ВРЕМЯ...\n');
  
  const now = new Date();
  console.log(`⏰ Текущее время: ${now.toISOString()}`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    // Get all active run first
    const runsResult = await dynamodb.send(new ScanCommand({
      TableName: 'AdsterraRuns',
      FilterExpression: '#status = :status',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    }));

    const runs = runsResult.Items || [];
    
    if (runs.length === 0) {
      console.log('❌ No active runs found');
      return;
    }

    console.log(`✅ Found ${runs.length} active run(s)\n`);

    for (const run of runs) {
      console.log(`📦 Processing run: ${run.id}`);
      
      // Get all pending jobs for this run
      const jobsResult = await dynamodb.send(new QueryCommand({
        TableName: 'AdsterraJobs',
        KeyConditionExpression: 'runId = :runId',
        FilterExpression: '#status IN (:pending, :ready)',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':runId': run.id,
          ':pending': 'pending',
          ':ready': 'ready'
        }
      }));

      const jobs = jobsResult.Items || [];
      console.log(`   📊 Found ${jobs.length} pending/ready jobs`);

      // Update each job to schedule for NOW
      let updated = 0;
      for (const job of jobs) {
        try {
          // Create a small delay between each task (1-3 seconds) for realistic execution
          const delayMs = Math.random() * 2000 + 1000;
          const scheduledTime = new Date(now.getTime() + delayMs);

          await dynamodb.send(new UpdateCommand({
            TableName: 'AdsterraJobs',
            Key: {
              runId: job.runId,
              jobId: job.jobId
            },
            UpdateExpression: 'SET scheduledTime = :scheduledTime, #status = :status',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':scheduledTime': scheduledTime.toISOString(),
              ':status': 'ready'
            }
          }));

          updated++;
        } catch (err) {
          console.error(`   ❌ Failed to update job ${job.jobId}:`, err);
        }
      }

      console.log(`   ✅ Updated ${updated}/${jobs.length} jobs to start NOW\n`);
    }

    console.log('🎉 Все задачи переперепланированы на ТЕКУЩЕЕ ВРЕМЯ!');
    console.log('📝 Они начнут выполняться в течение 1-3 секунд...\n');

  } catch (error) {
    console.error('❌ Error rescheduling tasks:', error);
    process.exit(1);
  }
}

rescheduleTasksToNow();
