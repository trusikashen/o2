import { botConfig } from './config';
import { addBulkJobs, getQueueStats } from './queue/dynamodb-queue';
import { SessionJob } from './types';
import { random } from './utils/helpers';

async function createSessionJobs(): Promise<SessionJob[]> {
  const jobs: SessionJob[] = [];
  const now = Date.now();
  const hoursInDay = 24;
  const msInDay = hoursInDay * 60 * 60 * 1000;

  console.log(`Creating ${botConfig.totalBots} bots with ${botConfig.sessionsPerBot} sessions each...`);
  console.log(`Total sessions: ${botConfig.totalBots * botConfig.sessionsPerBot}`);

  for (let botIndex = 0; botIndex < botConfig.totalBots; botIndex++) {
    const botId = `bot-${String(botIndex).padStart(5, '0')}`;

    for (let sessionNum = 1; sessionNum <= botConfig.sessionsPerBot; sessionNum++) {
      // Calculate base time for this session (spread across 24 hours)
      const sessionProgress = (sessionNum - 1) / botConfig.sessionsPerBot;
      const baseDelay = sessionProgress * msInDay;

      // Add random offset (0-10 minutes) to stagger launches
      const randomOffset = random(0, 10 * 60 * 1000);

      // Add bot index offset to spread bots across time
      const botOffset = (botIndex / botConfig.totalBots) * (msInDay / botConfig.sessionsPerBot);

      const scheduledTime = new Date(now + baseDelay + randomOffset + botOffset);

      const job: SessionJob = {
        id: `${botId}-session-${sessionNum}`,
        botId,
        sessionNumber: sessionNum,
        scheduledTime,
        status: 'pending',
      };

      jobs.push(job);
    }
  }

  // Sort by scheduled time
  jobs.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

  return jobs;
}

async function main() {
  console.log('🎯 Adsterra Bot Orchestrator');
  console.log('============================');
  console.log(`Total Bots: ${botConfig.totalBots}`);
  console.log(`Sessions per Bot: ${botConfig.sessionsPerBot}`);
  console.log(`Target Impressions: ${botConfig.targetImpressions}`);
  console.log('');

  try {
    // Create all session jobs
    console.log('Creating session jobs...');
    const jobs = await createSessionJobs();
    console.log(`Created ${jobs.length} session jobs`);

    // Add jobs to DynamoDB queue
    console.log('Adding jobs to DynamoDB queue...');
    await addBulkJobs(jobs);
    console.log(`✅ Added ${jobs.length} jobs to DynamoDB queue`);

    // Show queue stats
    const stats = await getQueueStats();
    console.log('');
    console.log('Queue Stats:');
    console.log(`  Waiting: ${stats.waiting}`);
    console.log(`  Active: ${stats.active}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Failed: ${stats.failed}`);
    console.log(`  Total: ${stats.total}`);

    // Show first few scheduled times
    console.log('');
    console.log('First 10 scheduled sessions:');
    jobs.slice(0, 10).forEach((job) => {
      console.log(`  ${job.botId} Session ${job.sessionNumber}: ${job.scheduledTime.toISOString()}`);
    });

    console.log('');
    console.log('✅ Orchestrator setup complete!');
    console.log('Start workers with: npm run worker');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();

