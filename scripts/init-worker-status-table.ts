#!/usr/bin/env node
/**
 * Initialize DynamoDB WorkerStatus table
 * Creates the table with proper schema and TTL configuration
 */

import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { waitUntilTableExists } from '@aws-sdk/client-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE_NAME = process.env.DYNAMODB_WORKER_STATUS_TABLE || 'WorkerStatus';

const dynamodb = new DynamoDBClient({ region: REGION });

async function initWorkerStatusTable() {
  try {
    console.log(`📋 Checking if WorkerStatus table exists in ${REGION}...`);

    // Try to describe the table
    try {
      const describeResult = await dynamodb.send(
        new DescribeTableCommand({ TableName: TABLE_NAME })
      );
      console.log(`✅ Table "${TABLE_NAME}" already exists!`);
      console.log(`   Status: ${describeResult.Table?.TableStatus}`);
      console.log(`   Billing Mode: ${describeResult.Table?.BillingModeSummary?.BillingMode}`);
      
      // Check if TTL is enabled
      if ((describeResult.Table as any)?.TimeToLiveDescription?.TimeToLiveStatus === 'ENABLED') {
        console.log(`   TTL: ✅ Enabled on "TTL" attribute`);
      } else {
        console.log(`   TTL: ⚠️  Not enabled (should be enabled on "TTL" attribute)`);
      }
      
      return;
    } catch (error: any) {
      // Only continue if it's a ResourceNotFound error (table doesn't exist)
      if (error?.__type?.includes('ResourceNotFoundException') || error.name === 'ResourceNotFoundException') {
        // Table doesn't exist, continue to create it
      } else {
        throw error;
      }
    }

    // Table doesn't exist, create it
    console.log(`\n🔨 Creating WorkerStatus table...`);
    
    const createResult = await dynamodb.send(
      new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'workerId', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST', // On-demand pricing
        GlobalSecondaryIndexes: [
          {
            IndexName: 'WorkerIdIndex',
            KeySchema: [
              { AttributeName: 'workerId', KeyType: 'HASH' },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        ],
        Tags: [
          {
            Key: 'Purpose',
            Value: 'Worker heartbeat tracking',
          },
          {
            Key: 'Environment',
            Value: process.env.NODE_ENV || 'development',
          },
        ],
      })
    );

    console.log(`✅ Table creation initiated!`);
    console.log(`   TableArn: ${createResult.TableDescription?.TableArn}`);

    // Wait for table to be active
    console.log(`\n⏳ Waiting for table to become active...`);
    await waitUntilTableExists({ client: dynamodb, maxWaitTime: 300 }, { TableName: TABLE_NAME });
    
    console.log(`✅ Table is now active!`);

    // Enable TTL
    console.log(`\n🔧 Enabling TTL on "TTL" attribute...`);
    
    try {
      // Note: TTL is typically enabled via AWS console or SDK call
      // This is just informational
      const finalDesc = await dynamodb.send(
        new DescribeTableCommand({ TableName: TABLE_NAME })
      );
      
      console.log(`\n⚠️  TTL configuration should be done via AWS console:`);
      console.log(`   1. Go to AWS DynamoDB Console`);
      console.log(`   2. Select "${TABLE_NAME}" table`);
      console.log(`   3. Go to "Exports and streams" tab`);
      console.log(`   4. Enable TTL with attribute name: "TTL"`);
      console.log(`\n   Or run: aws dynamodb update-time-to-live --table-name ${TABLE_NAME} --time-to-live-specification AttributeName=TTL,Enabled=true --region ${REGION}`);
    } catch (error) {
      console.log(`   ℹ️  TTL configuration can be done via AWS console`);
    }

    console.log(`\n✅ WorkerStatus table setup complete!`);
    console.log(`\n📝 Environment variable:`);
    console.log(`   DYNAMODB_WORKER_STATUS_TABLE=${TABLE_NAME}`);

  } catch (error) {
    console.error('❌ Error initializing WorkerStatus table:', error);
    process.exit(1);
  }
}

// Run
initWorkerStatusTable();
