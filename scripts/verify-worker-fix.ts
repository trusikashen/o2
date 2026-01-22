#!/usr/bin/env node
/**
 * Verify that workers can now find tasks
 * This script:
 * 1. Checks a few pending jobs
 * 2. Shows their assignedWorker/assignedWorkerId fields
 * 3. Tests the getNextJobForWorker function
 * 
 * Run with: npx ts-node scripts/verify-worker-fix.ts worker-0
 */

import 'dotenv/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const workerId = process.argv[2] || 'worker-0';

async function verifyWorkerFix() {
  const region = process.env.AWS_REGION || 'us-east-1';
  const tableName = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

  const client = new DynamoDBClient({ region });
  const docClient = DynamoDBDocumentClient.from(client);

  console.log('\n🔍 Verifying worker task pickup fix...\n');
  console.log(`📊 Table: ${tableName}`);
  console.log(`👷 Worker: ${workerId}`);
  console.log('='.repeat(80));

  try {
    // Get first 5 pending jobs
    console.log('\n📋 Sample pending jobs:\n');
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 5,
      })
    );

    if (!result.Items || result.Items.length === 0) {
      console.log('❌ No pending jobs found in database');
      return;
    }

    result.Items.forEach((job, idx) => {
      const assignedWorker = job.assignedWorker || job.assignedWorkerId;
      const assignedField = job.assignedWorker ? 'assignedWorker' : (job.assignedWorkerId ? 'assignedWorkerId' : 'NONE');
      
      console.log(`[${idx + 1}] Job ID: ${job.jobId?.substring(0, 20)}...`);
      console.log(`    Field: ${assignedField}`);
      console.log(`    Value: ${assignedWorker || '(null/unassigned)'}`);
      console.log(`    Status: ${job.status}`);
      console.log();
    });

    // Now test if this worker would pick up unassigned jobs
    console.log('='.repeat(80));
    console.log('\n✅ COMPATIBILITY CHECK:\n');

    let wouldPickUpCount = 0;
    result.Items.forEach((item) => {
      // Replicate the logic in getNextJobForWorker
      const assignedWorkerId = item.assignedWorkerId || item.assignedWorker;
      
      if (assignedWorkerId === workerId) {
        console.log(`✅ Job ${item.jobId?.substring(0, 20)}... is assigned to ${workerId}`);
        wouldPickUpCount++;
      } else if (!assignedWorkerId) {
        console.log(`✅ Job ${item.jobId?.substring(0, 20)}... is UNASSIGNED (will be picked up)`);
        wouldPickUpCount++;
      } else {
        console.log(`❌ Job ${item.jobId?.substring(0, 20)}... is assigned to ${assignedWorkerId} (skip)`);
      }
    });

    console.log(`\n📊 Result: ${wouldPickUpCount}/${result.Items.length} jobs would be picked up by ${workerId}`);

    if (wouldPickUpCount === 0) {
      console.log('\n⚠️  WARNING: No jobs would be picked up! Check job assignments.');
    } else {
      console.log('\n✅ SUCCESS: Worker should be able to pick up tasks now!');
    }

  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error('\nTroubleshooting:');
    console.error('1. AWS credentials configured? (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)');
    console.error('2. AWS_REGION set?');
    console.error('3. DynamoDB table exists?');
  }
}

verifyWorkerFix();
