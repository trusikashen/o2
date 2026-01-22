#!/usr/bin/env node

/**
 * Test: Update only ONE job to start immediately
 * Usage: node scripts/test-one-job.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function testOneJob() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🧪 ТЕСТ: Обновляю ОДНУ задачу...\n');
  
  try {
    // Get first job
    console.log('🔍 Ищу первую задачу...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable,
        Limit: 1
      })
    );

    const jobs = jobsScan.Items || [];
    if (jobs.length === 0) {
      console.log('❌ Нет задач в базе\n');
      return;
    }

    const job = jobs[0];
    console.log(`✅ Найдена задача: ${job.jobId}`);
    console.log(`   PK: ${job.PK}`);
    console.log(`   SK: ${job.SK}`);
    console.log(`   Текущее время запуска: ${job.scheduledTime}\n`);

    // Update to past time (10 minutes ago)
    const now = new Date();
    const pastTime = new Date(now.getTime() - 10 * 60 * 1000);

    console.log(`⏰ Обновляю время на: ${pastTime.toISOString()}`);
    
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

    console.log(`✅ Задача обновлена успешно!\n`);
    console.log('🎯 Если всё хорошо, запусти:');
    console.log('   node scripts/bulk-update-all-jobs.js\n');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    process.exit(1);
  }
}

testOneJob();
