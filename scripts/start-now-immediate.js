#!/usr/bin/env node

/**
 * START ALL JOBS IMMEDIATELY - Set time to 10 minutes in the PAST
 * This ensures jobs are ready for immediate execution
 * Usage: node scripts/start-now-immediate.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function startJobsImmediately() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n⚡ НЕМЕДЛЕННЫЙ ЗАПУСК ВСЕХ ЗАДАЧ (устанавливаю время в ПРОШЛОЕ)...\n');
  
  const now = new Date();
  // Set time to 10 minutes in the past to ensure immediate execution
  const pastTime = new Date(now.getTime() - 10 * 60 * 1000);
  
  console.log(`⏰ Текущее время (UTC): ${now.toISOString()}`);
  console.log(`⏰ Новое время (UTC, прошлое): ${pastTime.toISOString()}`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    console.log('🔍 Сканирование ВСЕХ задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable
      })
    );

    const allJobs = jobsScan.Items || [];
    console.log(`✅ Найдено ВСЕГО ${allJobs.length} задач\n`);

    if (allJobs.length === 0) {
      console.log('⚠️  Нет задач для запуска\n');
      return;
    }

    // Update each job to past time
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < allJobs.length; i++) {
      try {
        const job = allJobs[i];

        await docClient.send(
          new UpdateCommand({
            TableName: jobsTable,
            Key: {
              PK: job.PK,
              SK: job.SK
            },
            UpdateExpression: 'SET scheduledTime = :scheduledTime, GSI1SK = :scheduledTime',
            ExpressionAttributeValues: {
              ':scheduledTime': pastTime.toISOString()
            }
          })
        );

        updated++;
        if ((i + 1) % 50 === 0) {
          console.log(`   ⏳ Обновлено ${i + 1}/${allJobs.length}...`);
        }
      } catch (err) {
        failed++;
        console.error(`   ❌ Ошибка обновления job ${job.jobId}:`, err.message);
      }
    }

    console.log(`\n✅ ИТОГО: Обновлено ${updated}/${allJobs.length} задач (ошибок: ${failed})\n`);
    console.log('🎉 ВСЕ ЗАДАЧИ УСТАНОВЛЕНЫ НА ВРЕМЯ В ПРОШЛОМ!');
    console.log('⚡ НАЧИНАЙТЕ РАБОТУ - ЗАДАЧИ БУДУТ ЗАПУЩЕНЫ НЕМЕДЛЕННО!\n');

  } catch (error) {
    console.error('❌ Ошибка:', error);
    process.exit(1);
  }
}

startJobsImmediately();
