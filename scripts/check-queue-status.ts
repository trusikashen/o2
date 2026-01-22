/**
 * Check current queue status - see what jobs are pending/active/completed
 * This shows what the worker is actually processing
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { getQueueStats, getJobsByStatus } from '../src/queue/dynamodb-queue';

// Load .env
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

async function checkQueueStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 Checking Queue Status (What Worker is Processing)');
  console.log('='.repeat(60) + '\n');

  try {
    // Get overall stats
    const stats = await getQueueStats();
    
    console.log('📦 Overall Queue Statistics:');
    console.log(`   ⏳ Pending/Waiting: ${stats.waiting.toLocaleString()}`);
    console.log(`   🔄 Active: ${stats.active.toLocaleString()}`);
    console.log(`   ✅ Completed: ${stats.completed.toLocaleString()}`);
    console.log(`   ❌ Failed: ${stats.failed.toLocaleString()}`);
    console.log(`   📊 Total: ${(stats.waiting + stats.active + stats.completed + stats.failed).toLocaleString()}\n`);

    // Get sample of pending jobs to see runIds
    if (stats.waiting > 0) {
      console.log('🔍 Checking pending jobs (first 10) to see which runs they belong to...\n');
      const pendingJobs = await getJobsByStatus('pending', 10);
      
      if (pendingJobs.length > 0) {
        const runIds = new Set(pendingJobs.map(job => job.runId).filter(Boolean));
        console.log(`   Found jobs from ${runIds.size} run(s):`);
        runIds.forEach(runId => {
          const count = pendingJobs.filter(j => j.runId === runId).length;
          console.log(`   - Run ID: ${runId} (${count} jobs shown, likely more in queue)`);
        });
        console.log('');
      }
    }

    // Get sample of active jobs
    if (stats.active > 0) {
      console.log('🔄 Checking active jobs (currently being processed)...\n');
      const activeJobs = await getJobsByStatus('active', 10);
      
      if (activeJobs.length > 0) {
        const runIds = new Set(activeJobs.map(job => job.runId).filter(Boolean));
        console.log(`   Currently processing jobs from ${runIds.size} run(s):`);
        activeJobs.forEach(job => {
          console.log(`   - ${job.botId} Session ${job.sessionNumber} (Run: ${job.runId || 'N/A'})`);
        });
        console.log('');
      }
    }

    if (stats.waiting === 0 && stats.active === 0) {
      console.log('✅ No pending or active jobs - queue is empty!\n');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkQueueStatus();

