#!/usr/bin/env node

/**
 * Bulk update ALL jobs using batch operations (FAST)
 * Usage: node scripts/bulk-update-all-jobs.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

async function bulkUpdateAllJobs() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n⚡ БЫСТРОЕ БАТЧЕВОЕ ОБНОВЛЕНИЕ ВСЕХ ЗАДАЧ...\n');
  
  const now = new Date();
  const pastTime = new Date(now.getTime() - 10 * 60 * 1000).toISOString();

  console.log(`⏰ Новое время (10 минут в прошлом): ${pastTime}`);
  console.log(`📍 Локальное время: ${now.toLocaleString()}\n`);

  try {
    // Get ALL jobs
    console.log('🔍 Сканирование всех задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable
      })
    );

    const allJobs = jobsScan.Items || [];
    console.log(`✅ Найдено ${allJobs.length} задач\n`);

    if (allJobs.length === 0) {
      console.log('⚠️  Нет задач для обновления\n');
      return;
    }

    // Batch update in groups of 25 (DynamoDB batch limit)
    let updated = 0;
    let failed = 0;
    const batchSize = 25;

    for (let i = 0; i < allJobs.length; i += batchSize) {
      const batch = allJobs.slice(i, i + batchSize);
      
      const requests = batch.map(job => ({
        Update: {
          TableName: jobsTable,
          Key: {
            PK: job.PK,
            SK: job.SK
          },
          UpdateExpression: 'SET scheduledTime = :scheduledTime, GSI1SK = :scheduledTime',
          ExpressionAttributeValues: {
            ':scheduledTime': pastTime
          }
        }
      }));

      try {
        await docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [jobsTable]: requests
            }
          })
        );
        updated += batch.length;
        console.log(`   ✅ Обновлено ${updated}/${allJobs.length}`);
      } catch (err) {
        failed += batch.length;
        console.error(`   ❌ Ошибка в батче:`, err.message);
      }
    }

    console.log(`\n✅ ИТОГО: Обновлено ${updated}/${allJobs.length} задач (ошибок: ${failed})\n`);
    console.log('🎉 ВСЕ ЗАДАЧИ ГОТОВЫ К НЕМЕДЛЕННОМУ ЗАПУСКУ!');
    console.log('⚡ Задачи будут выполняться прямо сейчас!\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

bulkUpdateAllJobs();
