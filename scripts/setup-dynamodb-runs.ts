import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

// Load .env from adsterra folder
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

async function tableExists(tableName: string): Promise<boolean> {
  try {
    await dynamoClient.send(new DescribeTableCommand({ TableName: tableName }));
    return true;
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') return false;
    throw error;
  }
}

async function createRunsTable(): Promise<void> {
  console.log(`\n📋 Creating table: ${RUNS_TABLE}...`);

  if (await tableExists(RUNS_TABLE)) {
    console.log(`✅ Table "${RUNS_TABLE}" already exists. Skipping...`);
    return;
  }

  const command = new CreateTableCommand({
    TableName: RUNS_TABLE,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST',
    Tags: [
      { Key: 'Project', Value: 'AdsenseLoading' },
      { Key: 'Component', Value: 'Adsterra' },
      { Key: 'Description', Value: 'Stores Adsterra run configs and status' },
    ],
  });

  await dynamoClient.send(command);
  console.log(`✅ Successfully created table: ${RUNS_TABLE}`);
  console.log(`   Waiting for table to be active...`);

  let isActive = false;
  let attempts = 0;
  const maxAttempts = 30;

  while (!isActive && attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const response = await dynamoClient.send(
      new DescribeTableCommand({ TableName: RUNS_TABLE })
    );
    if (response.Table?.TableStatus === 'ACTIVE') {
      isActive = true;
      console.log(`✅ Table "${RUNS_TABLE}" is now ACTIVE`);
      break;
    }
    console.log(`   Status: ${response.Table?.TableStatus}...`);
    attempts++;
  }

  if (!isActive) {
    console.warn(`⚠️  Table "${RUNS_TABLE}" creation may still be in progress.`);
  }
}

async function main() {
  console.log('🚀 Setting up DynamoDB Runs Table for Adsterra...\n');
  console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`Table Name: ${RUNS_TABLE}`);

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: Missing AWS credentials');
    console.error('   Required: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  try {
    await createRunsTable();

    console.log('\n✨ DynamoDB Runs Table setup complete!');
    console.log('\n📊 Table Structure:');
    console.log('   - Partition Key (PK): RUN#<runId>');
    console.log('   - Sort Key (SK): META');
    console.log('   - Billing Mode: PAY_PER_REQUEST');
    console.log('\n💡 You can now create and manage runs from the frontend!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();


