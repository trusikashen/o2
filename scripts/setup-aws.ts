import 'dotenv/config';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

// Load .env from adsterra folder (if it exists)
const envPath = resolve(process.cwd(), '.env');
try {
  config({ path: envPath });
} catch (e) {
  // .env might not exist, that's okay
}

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

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

  // Check if table already exists
  if (await tableExists(tableName)) {
    console.log(`✅ Table "${tableName}" already exists. Skipping...`);
    return;
  }

  const command = new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' }, // Partition key
      { AttributeName: 'SK', KeyType: 'RANGE' }, // Sort key
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    BillingMode: 'PAY_PER_REQUEST', // On-demand pricing (no need to specify read/write capacity)
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
    
    // Wait for table to be active
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
  console.log('🚀 Setting up AWS resources for Adsterra Bot System...\n');
  console.log(`AWS Region: ${process.env.AWS_REGION || 'us-east-1'}`);
  console.log(`Table Name: ${ADSTERRA_RUNS_TABLE}`);

  // Validate environment variables
  if (!process.env.AWS_REGION) {
    console.warn('⚠️  AWS_REGION not set, defaulting to us-east-1');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.error('❌ Error: Missing AWS credentials');
    console.error('   Required environment variables:');
    console.error('   - AWS_ACCESS_KEY_ID');
    console.error('   - AWS_SECRET_ACCESS_KEY');
    console.error('\n💡 Please set these in your .env file in the adsterra folder');
    process.exit(1);
  }

  try {
    console.log('\n🔨 Creating Adsterra DynamoDB table...');
    
    // Create AdsterraRuns table
    await createTable(
      ADSTERRA_RUNS_TABLE,
      'Stores Adsterra bot run configurations and statistics'
    );

    console.log('\n✨ AWS setup complete!');
    console.log('\n📊 Table Structure:');
    console.log('   - Partition Key (PK): String (e.g., "RUN#<runId>")');
    console.log('   - Sort Key (SK): String (e.g., "META")');
    console.log('   - Billing Mode: PAY_PER_REQUEST (on-demand)');
    console.log('\n📋 Created Table:');
    console.log(`   ✅ ${ADSTERRA_RUNS_TABLE} - Adsterra bot runs`);
    console.log('\n💡 You can now start using the Adsterra bot system!');
    console.log('\n📝 Next Steps:');
    console.log('   1. Make sure Redis is running (for queue system)');
    console.log('   2. Start the orchestrator: npm run orchestrator');
    console.log('   3. Start workers: npm run worker');
    console.log('   4. Access the frontend at: http://localhost:3000/adsterra');
  } catch (error: any) {
    console.error('\n❌ Error setting up AWS resources:');
    console.error(error.message);
    
    if (error.name === 'UnrecognizedClientException' || error.message.includes('credentials')) {
      console.error('\n💡 Make sure your AWS credentials are configured correctly:');
      console.error('   - Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env');
      console.error('   - Verify your AWS credentials have DynamoDB permissions');
      console.error('   - Required permissions: dynamodb:CreateTable, dynamodb:DescribeTable');
    }
    
    if (error.name === 'AccessDeniedException') {
      console.error('\n💡 Your AWS credentials may not have sufficient permissions:');
      console.error('   - Required: dynamodb:CreateTable');
      console.error('   - Required: dynamodb:DescribeTable');
      console.error('   - Required: dynamodb:TagResource');
    }
    
    process.exit(1);
  }
}

main();

