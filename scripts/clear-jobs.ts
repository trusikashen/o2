#!/usr/bin/env tsx
import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const ddbDocClient = DynamoDBDocumentClient.from(client);

async function clearAllJobs() {
  console.log('\n🔍 Scanning for jobs in DynamoDB (with pagination)...');
  
  try {
    // Scan with pagination to get ALL items
    const allItems: any[] = [];
    let lastEvaluatedKey: any = undefined;
    let scanCount = 0;

    do {
      const result = await ddbDocClient.send(
        new ScanCommand({
          TableName: JOBS_TABLE,
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (result.Items) {
        allItems.push(...result.Items);
      }
      
      lastEvaluatedKey = result.LastEvaluatedKey;
      scanCount++;
      
      if (lastEvaluatedKey) {
        process.stdout.write(`\r📡 Scanned page ${scanCount}, found ${allItems.length} jobs so far...`);
      }
    } while (lastEvaluatedKey);

    console.log(`\n📊 Found ${allItems.length} total jobs to delete`);

    if (allItems.length === 0) {
      console.log('✨ No jobs to delete. Database is clean!');
      return;
    }

    console.log('🗑️  Deleting all jobs...\n');

    let deleted = 0;
    let failed = 0;
    
    // Delete in batches for better performance
    const batchSize = 25;
    for (let i = 0; i < allItems.length; i += batchSize) {
      const batch = allItems.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (item) => {
          try {
            await ddbDocClient.send(
              new DeleteCommand({
                TableName: JOBS_TABLE,
                Key: {
                  PK: item.PK,
                  SK: item.SK,
                },
              })
            );
            deleted++;
          } catch (error: any) {
            failed++;
            console.error(`❌ Failed to delete job ${item.jobId || item.PK}:`, error.message);
          }
        })
      );
      
      // Show progress every 100 jobs
      if (deleted % 100 === 0 || deleted + failed === allItems.length) {
        process.stdout.write(`\r✅ Deleted ${deleted}/${allItems.length} jobs...`);
      }
    }

    console.log(`\n\n✨ Successfully deleted ${deleted} jobs${failed > 0 ? ` (${failed} failed)` : ''}!`);
    console.log('🎉 Database cleanup complete!');
  } catch (error: any) {
    console.error('❌ Error clearing jobs:', error.message);
    process.exit(1);
  }
}

clearAllJobs();

