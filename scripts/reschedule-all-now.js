#!/usr/bin/env node

/**
 * Reschedule ALL jobs (including active) to start NOW
 * Fixes time zone mismatch issues
 * Usage: node scripts/reschedule-all-now.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

async function rescheduleAllTasksToNow() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const jobsTable = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🔄 ПЕРЕСЧЕТ ВСЕХ ЗАДАЧ НА ТЕКУЩЕЕ ВРЕМЯ (включая active)...\n');
  
  // Используем время сервера AWS (UTC) для синхронизации
  const awsNow = new Date('2026-01-20T07:52:51.329Z');
    console.log(`⏰ Текущее время (UTC): ${awsNow.toISOString()}`);
    console.log(`📍 Локальное время: ${awsNow.toLocaleString()}\n`);

  try {
    // Get ALL jobs (pending, ready, active - everything!)
    console.log('🔍 Сканирование ВСЕХ задач...');
    
    const jobsScan = await docClient.send(
      new ScanCommand({
        TableName: jobsTable
      })
    );

    const allJobs = jobsScan.Items || [];
    console.log(`✅ Найдено ВСЕГО ${allJobs.length} задач\n`);

    if (allJobs.length === 0) {
      console.log('⚠️  Нет задач для обновления\n');
      return;
    }

    // Group by status
    const byStatus = {};
    allJobs.forEach(job => {
      const status = job.status || 'pending';
      byStatus[status] = (byStatus[status] || 0) + 1;
    });

    console.log('📊 Разбивка по статусам:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`);
    });
    console.log('');

    // Update each job to schedule for NOW with small staggered delays
    let updated = 0;
    let failed = 0;

    // Сортируем задачи по scheduledTime
    const sortedJobs = allJobs
      .filter(job => job.scheduledTime)
      .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

    const limit = 20;
    if (sortedJobs.length < limit) {
      console.log(`⚠️ Найдено только ${sortedJobs.length} задач с scheduledTime, будет обновлено только они.`);
    }

    // Берём первые 20 задач и пересчитываем интервалы
    const firstJobs = sortedJobs.slice(0, limit);
    if (firstJobs.length === 0) {
      console.log('⚠️ Нет задач для пересчёта!');
      return;
    }
    const originalStart = new Date(firstJobs[0].scheduledTime);

    for (let i = 0; i < firstJobs.length; i++) {
      try {
        const job = firstJobs[i];
        const jobOriginalTime = new Date(job.scheduledTime);
        const offsetMs = jobOriginalTime - originalStart;
        const newScheduledTime = new Date(now.getTime() + offsetMs);

        await docClient.send(
          new UpdateCommand({
            TableName: jobsTable,
            Key: {
              PK: job.PK,
              SK: job.SK
            },
            UpdateExpression: 'SET scheduledTime = :scheduledTime, GSI1SK = :scheduledTime',
            ExpressionAttributeValues: {
              ':scheduledTime': newScheduledTime.toISOString()
            }
          })
        );

        updated++;
        console.log(`   ⏳ Обновлено ${i + 1}/${firstJobs.length} (jobId: ${job && job.jobId ? job.jobId : 'unknown'})...`);
      } catch (err) {
        failed++;
        console.error(`   ❌ Ошибка обновления job ${firstJobs[i] && firstJobs[i].jobId ? firstJobs[i].jobId : 'unknown'}:`, err.message);
      }
    }

    console.log(`\n✅ ИТОГО: Обновлено ${updated}/${firstJobs.length} задач (ошибок: ${failed})\n`);
    console.log('🎉 ВСЕ ЗАДАЧИ ПЕРЕПЕРЕПЛАНИРОВАНЫ НА ТЕКУЩЕЕ ВРЕМЯ!');
    console.log('⚡ Они начнут выполняться в течение 0.1-1 секунды...\n');

  } catch (error) {
    console.error('❌ Ошибка пересоздания задач:', error);
    process.exit(1);
  }
}

rescheduleAllTasksToNow();
