#!/usr/bin/env node

/**
 * Проверить расписание задач для конкретного worker
 * Использование: node scripts/check-worker-schedule.js worker-2
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const workerId = process.argv[2] || 'worker-2';

async function checkWorkerSchedule() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const tableName = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log(`\n🔍 Ищу задачи для worker: ${workerId}`);
  console.log(`📊 Таблица: ${tableName}`);
  console.log('='.repeat(80));

  try {
    // Сканируем всю таблицу, но фильтруем по workerId
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'attribute_exists(assignedWorkerId) AND assignedWorkerId = :workerId',
        ExpressionAttributeValues: {
          ':workerId': workerId,
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      console.log(`\n❌ Задачи для ${workerId} не найдены`);
      console.log('\nПопробуем поискать задачи со статусом "waiting"...');
      
      // Альтернативный поиск - все ожидающие задачи
      const allWaiting = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: '#status = :status',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': 'waiting',
          },
          Limit: 10, // Первые 10
        })
      );

      if (allWaiting.Items && allWaiting.Items.length > 0) {
        console.log(`\n📌 Первые 10 ожидающих задач:`);
        allWaiting.Items.forEach((job, idx) => {
          console.log(
            `${idx + 1}. Job: ${job.id?.substring(0, 16)}... | ` +
            `Run: ${job.runId?.substring(0, 12)}... | ` +
            `Scheduled: ${job.scheduledTime}`
          );
        });
      }
      return;
    }

    console.log(`\n✅ Найдено задач: ${result.Items.length}\n`);

    // Группируем по runId
    const byRun = {};
    result.Items.forEach((job) => {
      const runId = job.runId || 'unknown';
      if (!byRun[runId]) byRun[runId] = [];
      byRun[runId].push(job);
    });

    // Выводим по runId
    Object.entries(byRun).forEach(([runId, jobs]) => {
      console.log(`\n📦 Run: ${runId}`);
      console.log('-'.repeat(80));

      // Сортируем по времени запуска
      const sorted = jobs.sort((a, b) => {
        const timeA = new Date(a.scheduledTime).getTime();
        const timeB = new Date(b.scheduledTime).getTime();
        return timeA - timeB;
      });

      sorted.forEach((job, idx) => {
        const scheduled = new Date(job.scheduledTime);
        const now = new Date();
        const isReady = scheduled <= now;
        const timeDiff = Math.floor((scheduled.getTime() - now.getTime()) / 1000);
        const timeStr = isReady ? '✅ READY' : `⏳ ${Math.floor(timeDiff / 60)}m ${timeDiff % 60}s`;

        console.log(
          `  ${idx + 1}. [${job.status}] ${job.id?.substring(0, 14)}... ` +
          `| ${job.botId?.substring(0, 20)}... ` +
          `| ${scheduled.toISOString().substring(11, 19)} ` +
          `| ${timeStr}`
        );
      });

      const readyCount = sorted.filter(j => new Date(j.scheduledTime) <= new Date()).length;
      console.log(`\n  📊 Готово: ${readyCount}/${sorted.length}`);
    });

  } catch (error) {
    console.error(`\n❌ Ошибка при запросе к DynamoDB:`, error.message);
    console.error('\nУбедитесь что:');
    console.error('1. AWS credentials настроены (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    console.error('2. AWS_REGION задан');
    console.error('3. DynamoDB таблица существует');
  }
}

checkWorkerSchedule();
