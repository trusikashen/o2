import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';

// Load .env from project root
const envPath = resolve(process.cwd(), '.env');
config({ path: envPath });

const WORKERS_CONFIG_TABLE = process.env.DYNAMODB_WORKERS_CONFIG_TABLE || 'WorkersConfig';

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

async function createWorkersConfigTable(): Promise<void> {
  console.log(`\n📋 Creating table: ${WORKERS_CONFIG_TABLE}...`);

  if (await tableExists(WORKERS_CONFIG_TABLE)) {
    console.log(`✅ Table "${WORKERS_CONFIG_TABLE}" already exists. Skipping...`);
    return;
  }

  const command = new CreateTableCommand({
    TableName: WORKERS_CONFIG_TABLE,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST', // On-demand pricing
  });

  try {
    await dynamoClient.send(command);
    console.log(`✅ Table "${WORKERS_CONFIG_TABLE}" created successfully!`);
    console.log(`   PK: WORKER#worker-X`);
    console.log(`   SK: CONFIG`);
    console.log(`   Billing: On-demand (PAY_PER_REQUEST)`);
  } catch (error: any) {
    if (error.name === 'ResourceInUseException') {
      console.log(`✅ Table "${WORKERS_CONFIG_TABLE}" already exists.`);
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Setting up DynamoDB WorkersConfig table');
  console.log('='.repeat(60));
  console.log(`Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`Table: ${WORKERS_CONFIG_TABLE}`);

  try {
    await createWorkersConfigTable();

    console.log('\n' + '='.repeat(60));
    console.log('✅ Setup complete!');
    console.log('='.repeat(60));
    console.log('\nYou can now:');
    console.log(`1. Start the dev server: npm run dev`);
    console.log(`2. Navigate to: http://localhost:3000/admin/workers`);
    console.log(`3. Configure your workers with unique smart links`);
    console.log('\n');
  } catch (error: any) {
    console.error('\n❌ Error creating table:', error.message);
    process.exit(1);
  }
}

main();
