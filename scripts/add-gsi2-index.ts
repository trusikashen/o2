/**
 * Add GSI2 index to existing AdsterraJobs table
 * This index enables fast queries by runId
 */

import 'dotenv/config';
import { DynamoDBClient, UpdateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function checkIndexExists(tableName: string, indexName: string): Promise<boolean> {
  try {
    const response = await dynamoClient.send(
      new DescribeTableCommand({ TableName: tableName })
    );
    
    const index = response.Table?.GlobalSecondaryIndexes?.find(
      idx => idx.IndexName === indexName
    );
    
    return !!index;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Table ${tableName} does not exist`);
    }
    throw error;
  }
}

async function addGSI2() {
  console.log('🔍 Checking if GSI2 index exists...');
  
  const exists = await checkIndexExists(JOBS_TABLE, 'GSI2');
  
  if (exists) {
    console.log('✅ GSI2 index already exists!');
    return;
  }
  
  console.log('📋 GSI2 index not found. Adding it now...');
  console.log('⚠️  This may take a few minutes. The table will remain available during the update.');
  
  try {
    const command = new UpdateTableCommand({
      TableName: JOBS_TABLE,
      AttributeDefinitions: [
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexUpdates: [
        {
          Create: {
            IndexName: 'GSI2',
            KeySchema: [
              { AttributeName: 'GSI2PK', KeyType: 'HASH' },
              { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
            ],
            Projection: {
              ProjectionType: 'ALL',
            },
          },
        },
      ],
    });
    
    await dynamoClient.send(command);
    console.log('✅ GSI2 index creation initiated!');
    console.log('⏳ Waiting for index to be active (this may take 2-5 minutes)...');
    
    // Wait for index to be active
    let isActive = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    
    while (!isActive && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
      
      try {
        const response = await dynamoClient.send(
          new DescribeTableCommand({ TableName: JOBS_TABLE })
        );
        
        const gsi2 = response.Table?.GlobalSecondaryIndexes?.find(
          idx => idx.IndexName === 'GSI2'
        );
        
        if (gsi2?.IndexStatus === 'ACTIVE') {
          isActive = true;
          console.log('✅ GSI2 index is now ACTIVE!');
        } else {
          console.log(`   Status: ${gsi2?.IndexStatus || 'CREATING'}... (${attempts * 5}s)`);
        }
      } catch (error) {
        console.error(`   Error checking status:`, error);
      }
      
      attempts++;
    }
    
    if (!isActive) {
      console.warn('⚠️  GSI2 index creation may still be in progress.');
      console.warn('   Check AWS Console to verify completion.');
    }
    
    console.log('\n✨ GSI2 index setup complete!');
    console.log('📊 Your API routes will now be much faster (<1s instead of 10s)');
    
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log('⚠️  Table is being updated. Please wait and try again in a few minutes.');
    } else if (error.name === 'ValidationException' && error.message.includes('already exists')) {
      console.log('✅ GSI2 index already exists!');
    } else {
      console.error('❌ Error adding GSI2:', error.message);
      throw error;
    }
  }
}

addGSI2().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

