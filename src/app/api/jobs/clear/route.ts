import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});
const ddbDocClient = DynamoDBDocumentClient.from(client);

export async function DELETE(request: NextRequest) {
  try {
    console.log('🔍 Scanning for jobs in DynamoDB (with pagination)...');
    
    // Scan with pagination to get ALL items
    const allItems: any[] = [];
    let lastEvaluatedKey: any = undefined;
    let scanPages = 0;

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
      scanPages++;
      
      if (lastEvaluatedKey) {
        console.log(`📡 Scanned page ${scanPages}, found ${allItems.length} jobs so far...`);
      }
    } while (lastEvaluatedKey);

    console.log(`📊 Found ${allItems.length} total jobs to delete (in ${scanPages} pages)`);

    if (allItems.length === 0) {
      console.log('✨ No jobs to delete. Database is clean!');
      return NextResponse.json({
        success: true,
        message: 'Database is already clean! No jobs found. ✨',
        deletedCount: 0,
        failedCount: 0,
        jobsFound: 0,
      });
    }

    console.log(`🗑️  Starting deletion of ${allItems.length} jobs in batches...`);
    
    let deleted = 0;
    let failed = 0;
    const failedJobs: string[] = [];
    
    // Delete in batches for better performance
    const batchSize = 25;
    const totalBatches = Math.ceil(allItems.length / batchSize);
    
    for (let i = 0; i < allItems.length; i += batchSize) {
      const batchNum = Math.floor(i / batchSize) + 1;
      const batch = allItems.slice(i, i + batchSize);
      
      console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
      
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
            failedJobs.push(item.jobId || item.PK);
            console.error(`❌ Failed to delete job ${item.jobId || item.PK}:`, error.message);
          }
        })
      );
      
      const progress = Math.round((deleted + failed) / allItems.length * 100);
      console.log(`   ✅ Progress: ${deleted}/${allItems.length} deleted (${progress}%)`);
    }

    console.log(`\n🎉 OPERATION COMPLETE!`);
    console.log(`   ✅ Successfully deleted: ${deleted} jobs`);
    console.log(`   ❌ Failed to delete: ${failed} jobs`);
    console.log(`   📊 Total jobs found: ${allItems.length}`);
    console.log(`   💯 Success rate: ${((deleted / allItems.length) * 100).toFixed(1)}%\n`);

    return NextResponse.json({
      success: true,
      message: `✨ Successfully deleted ${deleted}/${allItems.length} jobs${failed > 0 ? ` (${failed} failed)` : ''}! Database cleanup complete.`,
      deletedCount: deleted,
      failedCount: failed,
      jobsFound: allItems.length,
      failedJobs: failedJobs.length > 0 ? failedJobs : undefined,
      successRate: ((deleted / allItems.length) * 100).toFixed(1),
    });
  } catch (error: any) {
    console.error('❌ Fatal Error:', error.message);
    console.error(error.stack);
    return NextResponse.json(
      {
        success: false,
        message: `❌ Error clearing jobs: ${error.message}`,
        deletedCount: 0,
        failedCount: 0,
        jobsFound: 0,
      },
      { status: 500 }
    );
  }
}
