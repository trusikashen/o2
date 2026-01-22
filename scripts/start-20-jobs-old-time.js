#!/usr/bin/env node

/**
 * Set 20 jobs to VERY OLD time to ensure immediate execution (ignoring timezone issues)
 * Usage: node scripts/start-20-jobs-old-time.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function start20JobsOldTime() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🚀 Устанавливаю ТОЛЬКО 20 ЗАДАЧ на ОЧЕНЬ РАННЕЕ ВРЕМЯ...\n');
  
  const now = new Date();
  // Set to very old time - GUARANTEE it's in the past
  const veryOldTime = '2026-01-20T00:00:00Z'; // Today 00:00 UTC - definitely in the past

  console.log(`⏰ Текущее время (UTC): ${now.toISOString()}`);
  console.log(`⏰ Новое время: ${veryOldTime} (ДАЛЁКОЕ ПРОШЛОЕ)`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    // Get ONLY first 20 jobs
    console.log('🔍 Ищу первые 20 задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable,
        Limit: 20
      })
    );

    const jobs = jobsScan.Items || [];
    console.log(`✅ Найдено ${jobs.length} задач для обновления\n`);

    if (jobs.length === 0) {
      console.log('⚠️  Нет задач\n');
      return;
    }

    // Update each job
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < jobs.length; i++) {
      try {
        const job = jobs[i];
        
        await docClient.send(
          new UpdateCommand({
            TableName: jobsTable,
            Key: {
              PK: job.PK,
              SK: job.SK
            },
            UpdateExpression: 'SET scheduledTime = :scheduledTime, GSI1SK = :scheduledTime',
            ExpressionAttributeValues: {
              ':scheduledTime': veryOldTime
            }
          })
        );

        updated++;
        console.log(`   ✅ ${i + 1}. ${job.botId || 'unknown'} - обновлена на ${veryOldTime}`);
      } catch (err) {
        failed++;
        console.error(`   ❌ Ошибка:`, err.message);
      }
    }

    console.log(`\n✅ ИТОГО: Обновлено ${updated}/20 задач\n`);
    console.log('🎯 20 ЗАДАЧ УСТАНОВЛЕНЫ НА ПРОШЛОЕ ВРЕМЯ И ГОТОВЫ К ЗАПУСКУ!\n');
    console.log('💡 Теперь просто запусти воркер и задачи начнут выполняться\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

start20JobsOldTime();
