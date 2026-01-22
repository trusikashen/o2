/**
 * List all active runs from DynamoDB
 * Shows which runs are currently running or pending
 */

import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AdsterraRun } from '../src/types';

// Load .env
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function listActiveRuns() {
  console.log('\n' + '='.repeat(60));
  console.log('🔍 Checking Active Runs in DynamoDB');
  console.log('='.repeat(60) + '\n');

  try {
    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: ADSTERRA_RUNS_TABLE,
        FilterExpression: '#status IN (:running, :pending)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { 
          ':running': 'running', 
          ':pending': 'pending' 
        },
      })
    );

    if (!result.Items || result.Items.length === 0) {
      console.log('✅ No active runs found in DynamoDB\n');
      return;
    }

    console.log(`📊 Found ${result.Items.length} active run(s):\n`);
    
    result.Items.forEach((item: any, index: number) => {
      const run: AdsterraRun = {
        id: item.id,
        name: item.name,
        status: item.status,
        config: item.config,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        stats: item.stats,
      };

      console.log(`${index + 1}. Run: ${run.name}`);
      console.log(`   ID: ${run.id}`);
      console.log(`   Status: ${run.status}`);
      console.log(`   Target Impressions: ${run.config?.targetImpressions?.toLocaleString() || 'N/A'}`);
      console.log(`   Total Bots: ${run.config?.totalBots?.toLocaleString() || 'N/A'}`);
      console.log(`   Sessions per Bot: ${run.config?.sessionsPerBot || 'N/A'}`);
      console.log(`   Concurrent Jobs: ${run.config?.concurrentJobs || 'Not set'}`);
      console.log(`   Created: ${new Date(run.createdAt).toLocaleString()}`);
      if (run.stats) {
        console.log(`   Completed: ${run.stats.completed || 0}`);
        console.log(`   Failed: ${run.stats.failed || 0}`);
      }
      console.log('');
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

listActiveRuns();

