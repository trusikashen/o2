/**
 * Update CONCURRENT_JOBS based on active runs in DynamoDB
 * This script reads all active runs and sets CONCURRENT_JOBS to the maximum
 * concurrency needed across all active runs.
 * 
 * Usage:
 *   npm run update:concurrency
 *   # or
 *   ts-node scripts/update-concurrency-from-runs.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AdsterraRun } from '../src/types';

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';
const ENV_FILE_PATH = join(__dirname, '../.env');

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function getAllActiveRuns(): Promise<AdsterraRun[]> {
  const result = await ddbDocClient.send(
    new ScanCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      FilterExpression: '#status IN (:running, :pending)',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':running': 'running',
        ':pending': 'pending',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return [];
  }

  return result.Items.map(item => ({
    id: item.id,
    name: item.name,
    status: item.status,
    config: item.config,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stats: item.stats,
  }));
}

function updateEnvFile(concurrentJobs: number): void {
  try {
    let envContent = readFileSync(ENV_FILE_PATH, 'utf-8');
    
    // Update or add CONCURRENT_JOBS
    if (envContent.includes('CONCURRENT_JOBS=')) {
      envContent = envContent.replace(
        /^CONCURRENT_JOBS=.*$/m,
        `CONCURRENT_JOBS=${concurrentJobs}`
      );
    } else {
      envContent += `\nCONCURRENT_JOBS=${concurrentJobs}\n`;
    }
    
    writeFileSync(ENV_FILE_PATH, envContent, 'utf-8');
    console.log(`✅ Updated .env file: CONCURRENT_JOBS=${concurrentJobs}`);
  } catch (error: any) {
    console.error('❌ Error updating .env file:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🔍 Checking active runs in DynamoDB...\n');
  
  const activeRuns = await getAllActiveRuns();
  
  if (activeRuns.length === 0) {
    console.log('⚠️  No active runs found. Using default concurrency: 2');
    updateEnvFile(2);
    return;
  }
  
  console.log(`📊 Found ${activeRuns.length} active run(s):`);
  activeRuns.forEach(run => {
    const concurrency = run.config.concurrentJobs || 2;
    console.log(`   - ${run.name} (${run.status}): ${concurrency} concurrent jobs`);
  });
  
  // Find maximum concurrency across all active runs
  const maxConcurrency = Math.max(
    ...activeRuns.map(run => run.config.concurrentJobs || 2)
  );
  
  console.log(`\n🎯 Maximum concurrency needed: ${maxConcurrency}`);
  console.log(`📝 Updating .env file...\n`);
  
  updateEnvFile(maxConcurrency);
  
  console.log('\n✅ Done! Restart PM2 worker to apply changes:');
  console.log('   pm2 restart adsterra-worker');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});

