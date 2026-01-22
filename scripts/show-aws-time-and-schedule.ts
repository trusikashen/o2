// Скрипт для вывода текущего времени AWS и расписания 10 ближайших задач из DynamoDB
import { getJobsByStatus } from '../src/queue/dynamodb-queue';

async function main() {
  try {
    // Текущее время в UTC
    const now = new Date();
    console.log('\n=== AWS TIME AND ALL TASKS ===');
    console.log('Current AWS UTC time:', now.toISOString());
    console.log('Timezone: UTC');
    console.log('Local time:', now.toTimeString());

    // Получаем задачи со всеми статусами
    const statuses = ['pending', 'active', 'completed', 'failed'] as const;
    const allJobs: any[] = [];
    
    for (const status of statuses) {
      const jobs = await getJobsByStatus(status, 50);
      console.log(`\n[${status.toUpperCase()}] Found: ${jobs.length} tasks`);
      
      if (jobs.length > 0) {
        jobs.forEach((job, i) => {
          const scheduledMs = job.scheduledTime.getTime();
          const nowMs = now.getTime();
          const delaySec = Math.round((scheduledMs - nowMs) / 1000);
          
          // Конвертируем время в локальное время пользователя
          const localTime = new Date(scheduledMs);
          const localTimeString = localTime.toLocaleString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          });
          
          console.log(
            `  ${i + 1}. ID: ${job.id}`
          );
          console.log(
            `     RunID: ${job.runId} | BotID: ${job.botId} | Session: ${job.sessionNumber}`
          );
          console.log(
            `     UTC:   ${job.scheduledTime.toISOString()}`
          );
          console.log(
            `     LOCAL: ${localTimeString} (your timezone)`
          );
          console.log(
            `     Delay: ${delaySec}s ${delaySec < 0 ? '(PAST - SHOULD HAVE RUN)' : '(future)'}`
          );
          console.log('');
          
          allJobs.push({
            id: job.id,
            status,
            scheduledTime: job.scheduledTime,
            delay: delaySec
          });
        });
      }
    }

    // Сводка
    console.log('\n=== SUMMARY ===');
    console.log(`Total tasks: ${allJobs.length}`);
    
    const pastTasks = allJobs.filter(j => j.delay < 0);
    if (pastTasks.length > 0) {
      console.log(`\n⚠️  WARNING: ${pastTasks.length} tasks scheduled in PAST:`, pastTasks.map(t => t.id));
    }

  } catch (e: any) {
    console.error('\n✗ ERROR:', e.message);
    console.error('Details:', e.code || e);
    console.error('Stack:', e.stack);
    process.exit(1);
  }
}

main();
