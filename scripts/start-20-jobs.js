#!/usr/bin/env node

/**
 * Update only FIRST 20 jobs to start immediately
 * Usage: node scripts/start-20-jobs.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function start20Jobs() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🚀 Обновляю ТОЛЬКО 20 ЗАДАЧ...\n');
  
  const now = new Date();
  const pastTime = new Date(now.getTime() - 10 * 60 * 1000);

  console.log(`⏰ Текущее время: ${now.toISOString()}`);
  console.log(`⏰ Новое время (прошлое): ${pastTime.toISOString()}`);
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

    // Update each job one by one
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
              ':scheduledTime': pastTime.toISOString()
            }
          })
        );

        updated++;
        console.log(`   ✅ ${i + 1}. ${job.botId || 'unknown'} - обновлена`);
      } catch (err) {
        failed++;
        console.error(`   ❌ Ошибка:`, err.message);
      }
    }

    console.log(`\n✅ ИТОГО: Обновлено ${updated}/20 задач\n`);
    console.log('🎯 20 ЗАДАЧ ГОТОВЫ К НЕМЕДЛЕННОМУ ЗАПУСКУ!\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

start20Jobs();
