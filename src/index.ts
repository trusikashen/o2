import { botConfig } from './config';
import { getQueueStats } from './queue';

console.log('📊 Adsterra Bot System - Dashboard');
console.log('==================================');
console.log(`Total Bots: ${botConfig.totalBots}`);
console.log(`Sessions per Bot: ${botConfig.sessionsPerBot}`);
console.log(`Target Impressions: ${botConfig.targetImpressions}`);
console.log('');

// Note: With DynamoDB, we don't have real-time events
// Stats are polled instead

// Show stats periodically
setInterval(async () => {
  const stats = await getQueueStats();
  const progress = ((stats.completed / stats.total) * 100).toFixed(2);
  
  console.log('');
  console.log('📈 Queue Stats:');
  console.log(`  Waiting: ${stats.waiting}`);
  console.log(`  Active: ${stats.active}`);
  console.log(`  Completed: ${stats.completed} (${progress}%)`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Total: ${stats.total}`);
}, 60000); // Every minute

console.log('Monitoring queue... (Press Ctrl+C to exit)');

