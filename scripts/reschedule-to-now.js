#!/usr/bin/env node

/**
 * Reschedule all pending jobs to start NOW
 * Usage: node scripts/reschedule-to-now.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function rescheduleTasksToNow() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🔄 Пересоздание всех задач на ТЕКУЩЕЕ ВРЕМЯ...\n');
  
  const now = new Date();
  console.log(`⏰ Текущее время (UTC): ${now.toISOString()}`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    // Get all pending and ready jobs
    console.log('🔍 Поиск всех pending/ready задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable,
        FilterExpression: '#status = :pending OR #status = :ready',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pending': 'pending',
          ':ready': 'ready'
        }
      })
    );

    const allJobs = jobsScan.Items || [];
    console.log(`✅ Найдено ${allJobs.length} задач для обновления\n`);

    if (allJobs.length === 0) {
      console.log('⚠️  Нет задач для обновления\n');
      return;
    }

    // Update each job to schedule for NOW
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < allJobs.length; i++) {
      try {
        const job = allJobs[i];
        
        // Create a small delay between each task (0.5-2 seconds) for realistic execution
        const delayMs = Math.random() * 1500 + 500;
        const scheduledTime = new Date(now.getTime() + delayMs);

        await docClient.send(
          new UpdateCommand({
            TableName: jobsTable,
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
          })
        );

        updated++;
        if ((i + 1) % 25 === 0) {
          console.log(`   ⏳ Обновлено ${i + 1}/${allJobs.length}...`);
        }
      } catch (err) {
        failed++;
        console.error(`   ❌ Ошибка обновления job ${job.jobId}:`, err.message);
      }
    }

    console.log(`\n✅ Обновлено ${updated}/${allJobs.length} задач (ошибок: ${failed})\n`);
    console.log('🎉 Все задачи переперепланированы на ТЕКУЩЕЕ ВРЕМЯ!');
    console.log('⚡ Они начнут выполняться в течение 0.5-2 секунд...\n');

  } catch (error) {
    console.error('❌ Ошибка пересоздания задач:', error);
    process.exit(1);
  }
}

rescheduleTasksToNow();
