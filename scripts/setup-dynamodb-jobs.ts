import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

// Load .env from adsterra folder
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await dynamoClient.send(
      new DescribeTableCommand({ TableName: tableName })
    );
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    throw error;
  }
}

async function createTable(
  tableName: string,
  description: string
): Promise<void> {
  console.log(`\n📋 Creating table: ${tableName}...`);

  if (await tableExists(tableName)) {
    console.log(`✅ Table "${tableName}" already exists. Skipping...`);
    return;
  }

  const command = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'GSI2PK', AttributeType: 'S' },
      { AttributeName: 'GSI2SK', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
      },
      {
        IndexName: 'GSI2',
        KeySchema: [
          { AttributeName: 'GSI2PK', KeyType: 'HASH' },
          { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
      },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    Tags: [
      {
        Key: 'Project',
        Value: 'AdsenseLoading',
      },
      {
        Key: 'Component',
        Value: 'Adsterra',
      },
      {
        Key: 'Description',
        Value: description,
      },
    ],
  });

  try {
    await dynamoClient.send(command);
    console.log(`✅ Successfully created table: ${tableName}`);
    console.log(`   Waiting for table to be active...`);
    
    let isActive = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isActive && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      try {
        const describeCommand = new DescribeTableCommand({ TableName: tableName });
        const response = await dynamoClient.send(describeCommand);
        
        if (response.Table?.TableStatus === 'ACTIVE') {
          isActive = true;
          console.log(`✅ Table "${tableName}" is now ACTIVE`);
        } else {
          console.log(`   Status: ${response.Table?.TableStatus}...`);
        }
      } catch (error) {
        console.error(`   Error checking status:`, error);
      }
      
      attempts++;
    }

    if (!isActive) {
      console.warn(`⚠️  Table "${tableName}" creation may still be in progress.`);
    }
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log(`✅ Table "${tableName}" already exists.`);
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Setting up DynamoDB Jobs Table for Adsterra...\n');
  console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`Table Name: ${JOBS_TABLE}`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: Missing AWS credentials');
    console.error('   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  try {
    await createTable(
      JOBS_TABLE,
      'Stores Adsterra bot session jobs with status tracking'
    );

    console.log('\n✨ DynamoDB Jobs Table setup complete!');
    console.log('\n📊 Table Structure:');
    console.log('   - Partition Key (PK): JOB#<jobId>');
    console.log('   - Sort Key (SK): META');
    console.log('   - GSI1: STATUS#<status> / <scheduledTime>');
    console.log('   - Billing Mode: PAY_PER_REQUEST');
    console.log('\n💡 You can now create and process jobs!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();

