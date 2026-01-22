#!/usr/bin/env tsx
import 'dotenv/config';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand as DocScanCommand } from '@aws-sdk/lib-dynamodb';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function debugJobs() {
  console.log('\n🔍 Debugging DynamoDB Jobs Table');
  console.log('================================\n');
  
  console.log(`📋 Table: ${JOBS_TABLE}`);
  console.log(`🌍 Region: ${process.env.AWS_REGION || 'us-east-1'}\n`);

  try {
    // Scan ALL jobs (no filter) to see what's there
    console.log('📊 Scanning ALL jobs in table...\n');
    
    const result = await ddbDocClient.send(
      new DocScanCommand({
        TableName: JOBS_TABLE,
        Limit: 100,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      console.log('❌ NO JOBS FOUND IN TABLE!');
      return;
    }

    console.log(`✅ Found ${result.Items.length} items (limit 100):\n`);

    // Group by status
    const byStatus: Record<string, any[]> = {};
    const byRunId: Record<string, any[]> = {};

    for (const item of result.Items) {
      const status = item.status || 'unknown';
      const runId = item.runId || 'unknown';

      if (!byStatus[status]) {
        byStatus[status] = [];
      }
      if (!byRunId[runId]) {
        byRunId[runId] = [];
      }

      byStatus[status].push(item);
      byRunId[runId].push(item);
    }

    console.log('📈 Jobs by Status:');
    for (const [status, jobs] of Object.entries(byStatus)) {
      console.log(`   ${status}: ${jobs.length} jobs`);
    }

    console.log('\n📈 Jobs by RunId:');
    for (const [runId, jobs] of Object.entries(byRunId)) {
      console.log(`   ${runId}: ${jobs.length} jobs`);
    }

    console.log('\n📋 Sample Job Item:');
    if (result.Items.length > 0) {
      const sample = result.Items[0];
      console.log(JSON.stringify(sample, null, 2));
    }

    // Try to query by GSI1 (pending status)
    console.log('\n\n🔍 Querying by GSI1 (STATUS#pending)...\n');
    const gsi1Result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 10,
      })
    );

    console.log(`✅ GSI1 Query returned: ${gsi1Result.Items?.length || 0} items\n`);
    if (gsi1Result.Items && gsi1Result.Items.length > 0) {
      console.log('📋 First GSI1 result:');
      console.log(JSON.stringify(gsi1Result.Items[0], null, 2));
    } else {
      console.log('❌ NO PENDING JOBS FOUND IN GSI1!');
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ResourceNotFoundException') {
      console.error('   → Table does not exist!');
    }
    console.error(error);
  }

  console.log('\n================================\n');
}

debugJobs().catch(console.error);
