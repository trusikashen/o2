#!/usr/bin/env node

/**
 * Диагностика задач в DynamoDB - показывает ВСЕ задачи с их структурой
 * Использование: node scripts/diagnose-jobs.js
 */

require('dotenv').config();

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');

async function diagnoseJobs() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const tableName = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log(`\n🔍 Диагностика таблицы: ${tableName}`);
  console.log(`📍 Region: ${region}`);
  console.log('='.repeat(100));

  try {
    // Получаем ВСЕ задачи без фильтров
    console.log('\n📊 Сканирую таблицу...\n');
    
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        Limit: 50, // Первые 50
      })
    );

    const items = result.Items || [];
    console.log(`\n✅ Найдено всего задач: ${items.length}`);

    if (items.length === 0) {
      console.log('\n❌ Таблица пуста! Создайте задачи первым.');
      return;
    }

    // Анализ структуры
    console.log('\n' + '='.repeat(100));
    console.log('📋 СТРУКТУРА ЗАДАЧ:');
    console.log('='.repeat(100));

    const firstJob = items[0];
    console.log('\nПоля в задаче:');
    Object.keys(firstJob).forEach(key => {
      const value = firstJob[key];
      const type = typeof value;
      const preview = 
        type === 'object' ? JSON.stringify(value).substring(0, 50) :
        String(value).substring(0, 50);
      console.log(`  • ${key} (${type}): ${preview}`);
    });

    // Статистика по статусам
    console.log('\n' + '='.repeat(100));
    console.log('📈 СТАТИСТИКА:');
    console.log('='.repeat(100));

    const byStatus = {};
    const byRunId = {};
    const assignedWorkers = new Set();
    const botIds = new Set();

    items.forEach(job => {
      // По статусу
      const status = job.status || 'unknown';
      byStatus[status] = (byStatus[status] || 0) + 1;

      // По runId
      if (job.runId) {
        byRunId[job.runId] = (byRunId[job.runId] || 0) + 1;
      }

      // Assigned workers
      if (job.assignedWorker) {
        assignedWorkers.add(job.assignedWorker);
      }

      // Bot IDs
      if (job.botId) {
        botIds.add(job.botId);
      }
    });

    console.log('\nПо статусу:');
    Object.entries(byStatus).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log('\nУникальных run ID:', Object.keys(byRunId).length);
    Object.entries(byRunId).forEach(([runId, count]) => {
      console.log(`  ${runId}: ${count} задач`);
    });

    console.log(`\nУникальных assigned workers: ${assignedWorkers.size}`);
    if (assignedWorkers.size > 0) {
      Array.from(assignedWorkers).forEach(w => console.log(`  - ${w}`));
    }

    console.log(`\nУникальных bot ID: ${botIds.size}`);
    if (botIds.size > 0) {
      Array.from(botIds).slice(0, 5).forEach(b => console.log(`  - ${b}`));
    }

    // Выводим все задачи в читаемом виде
    console.log('\n' + '='.repeat(100));
    console.log('📝 ПЕРВЫЕ 20 ЗАДАЧ:');
    console.log('='.repeat(100));

    items.slice(0, 20).forEach((job, idx) => {
      const scheduled = job.scheduledTime ? new Date(job.scheduledTime) : null;
      const now = new Date();
      const isReady = scheduled && scheduled <= now ? '✅' : '⏳';
      const timeStr = scheduled ? scheduled.toISOString().substring(11, 19) : 'N/A';
      
      console.log(`\n${idx + 1}. Job: ${job.id?.substring(0, 20)}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Run: ${job.runId?.substring(0, 20)}`);
      console.log(`   Worker: ${job.assignedWorker || 'none'}`);
      console.log(`   Scheduled: ${timeStr} ${isReady}`);
      console.log(`   BotId: ${job.botId?.substring(0, 30)}`);
    });

    // Рекомендации
    console.log('\n' + '='.repeat(100));
    console.log('💡 РЕКОМЕНДАЦИИ:');
    console.log('='.repeat(100));

    if (Object.keys(byRunId).length === 0) {
      console.log('\n⚠️  Нет задач с runId! Проверьте:');
      console.log('   1. Создали ли вы run через админ панель?');
      console.log("   2. Были ли созданы job'ы для этого run?");
    }

    if (assignedWorkers.size === 0) {
      console.log('\n⚠️  Нет assigned workers! Это может быть нормально если:');
      console.log('   1. Используется режим "fast" (processImmediately)');
      console.log('   2. Worker выбирается автоматически');
    }

    if (byStatus['waiting'] === 0 && items.length > 0) {
      console.log('\n⚠️  Нет задач со статусом "waiting"!');
      console.log('   Статусы:', Object.keys(byStatus).join(', '));
    }

  } catch (error) {
    console.error(`\n❌ Ошибка:`, error.message);
    console.error('\nПроверьте:');
    console.error('1. AWS credentials (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    console.error('2. AWS_REGION переменная окружения');
    console.error('3. Таблица AdsterraJobs существует в DynamoDB');
    console.error('4. У вас есть доступ к DynamoDB');
  }
}

diagnoseJobs();
