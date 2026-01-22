#!/usr/bin/env node

/**
 * Reschedule all ACTIVE jobs to start NOW (accelerate execution)
 * Usage: node scripts/reschedule-active-now.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function rescheduleActiveTasksToNow() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🚀 Ускорение ВСЕХ активных задач на ТЕКУЩИЙ МОМЕНТ...\n');
  
  const now = new Date();
  console.log(`⏰ Текущее время (UTC): ${now.toISOString()}`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    // Get all ACTIVE jobs
    console.log('🔍 Поиск всех active задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable,
        FilterExpression: '#status = :active',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':active': 'active'
        }
      })
    );

    const allJobs = jobsScan.Items || [];
    console.log(`✅ Найдено ${allJobs.length} active задач для ускорения\n`);

    if (allJobs.length === 0) {
      console.log('⚠️  Нет active задач для ускорения\n');
      return;
    }

    // Update each job to schedule for NOW
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < allJobs.length; i++) {
      try {
        const job = allJobs[i];
        
        // Schedule immediately (no delay for active jobs)
        const scheduledTime = now.toISOString();

        await docClient.send(
          new UpdateCommand({
            TableName: jobsTable,
            Key: {
              PK: `JOB#${job.jobId}`,
              SK: 'META'
            },
            UpdateExpression: 'SET scheduledTime = :scheduledTime, GSI1SK = :scheduledTime, GSI2SK = :scheduledTime',
            ExpressionAttributeValues: {
              ':scheduledTime': scheduledTime
            }
          })
        );

        updated++;
        if ((i + 1) % 50 === 0) {
          console.log(`   ⏳ Ускорено ${i + 1}/${allJobs.length}...`);
        }
      } catch (err) {
        failed++;
        if (failed <= 5) {
          console.error(`   ❌ Ошибка ускорения job ${allJobs[i].jobId}:`, err.message);
        }
      }
    }

    console.log(`\n✅ Ускорено ${updated}/${allJobs.length} active задач (ошибок: ${failed})\n`);
    console.log('🎉 Все активные задачи переработаны на ТЕКУЩИЙ МОМЕНТ!');
    console.log('⚡ Они начнут выполняться ВСЕ ОДНОВРЕМЕННО прямо сейчас!\n');

  } catch (error) {
    console.error('❌ Ошибка ускорения задач:', error);
    process.exit(1);
  }
}

rescheduleActiveTasksToNow();
