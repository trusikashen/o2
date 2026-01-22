// @ts-nocheck
/**
 * GitHub Actions Orchestration Script
 * 
 * This script runs every 10 minutes via GitHub Actions and:
 * 1. Launches EC2 instances for new active runs
 * 2. Terminates instances for completed/cancelled runs
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { 
  EC2Client, 
  RunInstancesCommand, 
  TerminateInstancesCommand, 
  DescribeInstancesCommand,
  type Instance 
} from '@aws-sdk/client-ec2';

const REGION = process.env.AWS_REGION || 'us-east-1';
const RUNS_TABLE = process.env.DYNAMODB_RUNS_TABLE || 'AdsterraRuns';
const JOBS_TABLE = process.env.DYNAMODB_JOBS_TABLE || 'AdsterraJobs';

// EC2 Configuration
const AMI_ID = 'ami-044479a0573efacc8'; // Your existing AMI with code
const INSTANCE_TYPE = 't3.large'; // 8GB RAM, 2 vCPU
// Must match the EC2 Key Pair name in AWS (so you can SSH with your .pem)
const KEY_NAME = 'adsterra-bot-key-2';
const SECURITY_GROUP_ID = 'sg-049a27e2638701049';
const IAM_INSTANCE_PROFILE = 'adsterra-bot-profile';
const JOBS_PER_INSTANCE = 70; // Each t3.large can handle ~70 concurrent jobs

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const ec2Client = new EC2Client({ region: REGION });

interface AdsterraRun {
  id: string; // Primary key in DynamoDB
  runId?: string; // Optional alias
  status: 'pending' | 'active' | 'running' | 'completed' | 'cancelled';
  config: {
    concurrentJobs?: number;
  };
  instanceIds?: string[];
  createdAt: string;
  completedAt?: string;
}

async function main() {
  console.log('🔍 Starting orchestration check...');
  console.log(`Time: ${new Date().toISOString()}`);
  
  try {
    // Step 1: Launch instances for runs that need them
    await launchInstancesForNewRuns();
    
    // Step 2: Terminate instances for completed runs
    await terminateInstancesForCompletedRuns();
    
    console.log('✅ Orchestration check complete!');
  } catch (error) {
    console.error('❌ Orchestration failed:', error);
    process.exit(1);
  }
}

/**
 * Find active runs that need instances and launch them
 */
async function launchInstancesForNewRuns() {
  console.log('\n📋 Checking for runs that need instances...');
  
  // Scan for active/running runs without instances
  const result = await dynamoClient.send(new ScanCommand({
    TableName: RUNS_TABLE,
    FilterExpression: '(#status = :active OR #status = :running) AND attribute_not_exists(instanceIds)',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':active': 'active',
      ':running': 'running',
    },
  }));
  
  const runsNeedingInstances = (result.Items || []) as AdsterraRun[];
  
  if (runsNeedingInstances.length === 0) {
    console.log('  ℹ️  No runs need instances');
    return;
  }
  
  console.log(`  📦 Found ${runsNeedingInstances.length} run(s) needing instances`);
  
  for (const run of runsNeedingInstances) {
    await launchInstancesForRun(run);
  }
}

/**
 * Launch EC2 instances for a specific run
 */
async function launchInstancesForRun(run: AdsterraRun) {
  const runId = run.id || run.runId || 'unknown';
  const concurrentJobs = run.config.concurrentJobs || 50;
  const instanceCount = Math.max(1, Math.ceil(concurrentJobs / JOBS_PER_INSTANCE));
  
  console.log(`\n🚀 Launching instances for run: ${runId}`);
  console.log(`  • Concurrent jobs needed: ${concurrentJobs}`);
  console.log(`  • Instances to launch: ${instanceCount} × ${INSTANCE_TYPE}`);
  console.log(`  • Estimated cost: $${(instanceCount * 0.0832 * 24).toFixed(2)}/day`);
  
  // Get GitHub PAT from environment (set in GitHub Actions secrets)
  const githubPat = process.env.GH_PAT || process.env.GITHUB_TOKEN || '';
  const githubRepo = 'footyamigo/adsterra';
  
  if (githubPat) {
    console.log(`  ✅ GitHub PAT configured - instances will pull latest code`);
  } else {
    console.log(`  ⚠️  GitHub PAT not found - instances will use code from AMI (may be outdated)`);
  }
  
  // Get environment variables for .env file
  const envVars = {
    PROXY_PROVIDER: process.env.PROXY_PROVIDER || 'brightdata',
    BRIGHTDATA_HOST: process.env.BRIGHTDATA_HOST || 'brd.superproxy.io',
    BRIGHTDATA_PORT: process.env.BRIGHTDATA_PORT || '33335',
    BRIGHTDATA_USERNAME: process.env.BRIGHTDATA_USERNAME || '',
    BRIGHTDATA_PASSWORD: process.env.BRIGHTDATA_PASSWORD || '',
    BRIGHTDATA_ZONE: process.env.BRIGHTDATA_ZONE || 'residential_proxy1',
    DYNAMODB_ADSTERRA_JOBS_TABLE: process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs',
    DYNAMODB_ADSTERRA_RUNS_TABLE: process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns',
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    PROCESS_IMMEDIATELY: process.env.PROCESS_IMMEDIATELY || 'true',
    MAX_CONCURRENT_JOBS: process.env.MAX_CONCURRENT_JOBS || '500',
    BROWSER_HEADLESS: process.env.BROWSER_HEADLESS || 'true',
    QUEUE_POLL_INTERVAL: process.env.QUEUE_POLL_INTERVAL || '1000',
    MAX_RETRIES: process.env.MAX_RETRIES || '3',
  };
  
  // Build .env file content
  const envFileContent = `# Proxy Provider
PROXY_PROVIDER=${envVars.PROXY_PROVIDER}

# IMPORTANT: bind this worker to the run it was launched for (prevents stealing other runs' jobs)
RUN_ID=${runId}

# AWS Credentials (Direct injection to bypass IMDS/IAM profile issues)
AWS_ACCESS_KEY_ID=${process.env.AWS_ACCESS_KEY_ID || ''}
AWS_SECRET_ACCESS_KEY=${process.env.AWS_SECRET_ACCESS_KEY || ''}
AWS_SESSION_TOKEN=${process.env.AWS_SESSION_TOKEN || ''}

# BrightData Residential Proxy Configuration
BRIGHTDATA_HOST=${envVars.BRIGHTDATA_HOST}
BRIGHTDATA_PORT=${envVars.BRIGHTDATA_PORT}
BRIGHTDATA_USERNAME=${envVars.BRIGHTDATA_USERNAME}
BRIGHTDATA_PASSWORD=${envVars.BRIGHTDATA_PASSWORD}
BRIGHTDATA_ZONE=${envVars.BRIGHTDATA_ZONE}

# Queue Configuration (DynamoDB-based)
DYNAMODB_ADSTERRA_JOBS_TABLE=${envVars.DYNAMODB_ADSTERRA_JOBS_TABLE}
DYNAMODB_ADSTERRA_RUNS_TABLE=${envVars.DYNAMODB_ADSTERRA_RUNS_TABLE}
AWS_REGION=${envVars.AWS_REGION}
QUEUE_POLL_INTERVAL=${envVars.QUEUE_POLL_INTERVAL}
MAX_RETRIES=${envVars.MAX_RETRIES}

# Browser Configuration
BROWSER_HEADLESS=${envVars.BROWSER_HEADLESS}

# Worker Configuration
PROCESS_IMMEDIATELY=${envVars.PROCESS_IMMEDIATELY}
MAX_CONCURRENT_JOBS=${envVars.MAX_CONCURRENT_JOBS}
`;
  
  // Build git commands with authentication if PAT is available
  const gitCloneCmd = githubPat 
    ? `git clone https://${githubPat}@github.com/${githubRepo}.git`
    : `git clone https://github.com/${githubRepo}.git`;
  
  const gitPullCmd = githubPat
    ? `GIT_TERMINAL_PROMPT=0 git pull https://${githubPat}@github.com/${githubRepo}.git main`
    : 'git pull origin main';
  
  const gitConfigCmd = githubPat
    ? `git config --global url."https://${githubPat}@github.com/".insteadOf "https://github.com/"`
    : '# No GitHub PAT provided, using existing credentials or SSH';
  
  // UserData script to automatically bootstrap the machine and start the worker.
  // IMPORTANT: UserData runs as root. We install prerequisites as root, but run pm2/worker as ubuntu.
  const userDataScript = `#!/bin/bash
exec > /var/log/adsterra-startup.log 2>&1
set -euo pipefail

echo "=== Adsterra startup begin: $(date) ==="

# 1) Base deps
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates

# 2) Node 20 + npm (idempotent)
if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v || true
npm -v || true

# 3) PM2 (idempotent)
if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing pm2..."
  npm install -g pm2
fi

# 4) Ensure ubuntu user + home exists
id ubuntu >/dev/null 2>&1 || useradd -m -s /bin/bash ubuntu
mkdir -p /home/ubuntu
chown -R ubuntu:ubuntu /home/ubuntu

# 5) Checkout/update repo as ubuntu
sudo -u ubuntu bash -lc '
  set -e
  cd /home/ubuntu
  if [ ! -d adsterra/.git ]; then
    echo "Repo missing, cloning..."
    ${gitCloneCmd} || (echo "Clone failed (auth). Trying public clone..." && git clone https://github.com/${githubRepo}.git)
  fi
  cd adsterra
  ${gitConfigCmd}
  echo "Pulling latest code..."
  ${gitPullCmd} || (echo "git pull failed, continuing with existing code")
'

# 6) Write .env (as ubuntu)
echo "Writing /home/ubuntu/adsterra/.env ..."
cat > /home/ubuntu/adsterra/.env << EOF
${envFileContent}
EOF
chown ubuntu:ubuntu /home/ubuntu/adsterra/.env

# 7) Install deps & browsers as ubuntu
sudo -u ubuntu bash -lc '
  set -e
  cd /home/ubuntu/adsterra
  echo "Installing npm deps..."
  npm install --omit=dev
  echo "Installing Playwright chromium..."
  npx playwright install chromium || true
'

# 8) Start worker via pm2 as ubuntu (so pm2 process list is under ubuntu)
sudo -u ubuntu bash -lc '
  set -e
  cd /home/ubuntu/adsterra
  pm2 describe adsterra-worker >/dev/null 2>&1 && pm2 delete adsterra-worker || true
  pm2 start npm --name adsterra-worker -- run worker
  pm2 save || true
  pm2 status || true
'

echo "=== Adsterra startup done: $(date) ==="
echo "Logs: /var/log/adsterra-startup.log"
`;

  // Encode UserData as base64 (required by AWS)
  const userDataBase64 = Buffer.from(userDataScript).toString('base64');

  try {
    const result = await ec2Client.send(new RunInstancesCommand({
      ImageId: AMI_ID,
      InstanceType: INSTANCE_TYPE,
      MinCount: instanceCount,
      MaxCount: instanceCount,
      KeyName: KEY_NAME,
      SecurityGroupIds: [SECURITY_GROUP_ID],
      IamInstanceProfile: { Name: IAM_INSTANCE_PROFILE },
      UserData: userDataBase64,
      TagSpecifications: [{
        ResourceType: 'instance',
        Tags: [
          { Key: 'Name', Value: `adsterra-worker-${runId}` },
          { Key: 'RunId', Value: runId },
          { Key: 'Project', Value: 'AdsenseLoading' },
          { Key: 'ManagedBy', Value: 'GitHub-Actions' },
        ],
      }],
    }));
    
    const instanceIds = result.Instances?.map(i => i.InstanceId).filter(Boolean) as string[];
    
    if (!instanceIds || instanceIds.length === 0) {
      throw new Error('No instances were launched');
    }
    
    console.log(`  ✅ Launched ${instanceIds.length} instance(s):`);
    instanceIds.forEach(id => console.log(`     - ${id}`));
    
    // Update run with instance IDs (using composite key: PK + SK)
    await dynamoClient.send(new UpdateCommand({
      TableName: RUNS_TABLE,
      Key: {
        PK: `RUN#${runId}`,
        SK: 'META',
      },
      UpdateExpression: 'SET instanceIds = :ids, instancesLaunchedAt = :time',
      ExpressionAttributeValues: {
        ':ids': instanceIds,
        ':time': new Date().toISOString(),
      },
    }));
    
    console.log(`  ✅ Updated run record with instance IDs`);
    
  } catch (error) {
    console.error(`  ❌ Failed to launch instances for run ${runId}:`, error);
    throw error;
  }
}

/**
 * Find completed/cancelled runs with instances and terminate them
 */
async function terminateInstancesForCompletedRuns() {
  console.log('\n📋 Checking for completed runs with instances...');
  
  // Scan for completed/cancelled runs with instances
  const result = await dynamoClient.send(new ScanCommand({
    TableName: RUNS_TABLE,
    FilterExpression: '(#status = :completed OR #status = :cancelled) AND attribute_exists(instanceIds)',
    ExpressionAttributeNames: {
      '#status': 'status',
    },
    ExpressionAttributeValues: {
      ':completed': 'completed',
      ':cancelled': 'cancelled',
    },
  }));
  
  const runsWithInstances = (result.Items || []) as AdsterraRun[];
  
  if (runsWithInstances.length === 0) {
    console.log('  ℹ️  No completed runs have instances to terminate');
    return;
  }
  
  console.log(`  🛑 Found ${runsWithInstances.length} run(s) with instances to terminate`);
  
  for (const run of runsWithInstances) {
    await terminateInstancesForRun(run);
  }
}

/**
 * Terminate EC2 instances for a specific run
 */
async function terminateInstancesForRun(run: AdsterraRun) {
  const runId = run.id || run.runId || 'unknown';
  
  if (!run.instanceIds || run.instanceIds.length === 0) {
    console.log(`  ⚠️  Run ${runId} has no instances to terminate`);
    return;
  }
  
  console.log(`\n🛑 Terminating instances for run: ${runId}`);
  console.log(`  • Status: ${run.status}`);
  console.log(`  • Instances: ${run.instanceIds.length}`);
  
  try {
    // First, check if instances are still running
    const describeResult = await ec2Client.send(new DescribeInstancesCommand({
      InstanceIds: run.instanceIds,
    }));
    
    const instances: Instance[] = [];
    describeResult.Reservations?.forEach(reservation => {
      reservation.Instances?.forEach(instance => {
        if (instance.State?.Name !== 'terminated' && instance.State?.Name !== 'terminating') {
          instances.push(instance);
        }
      });
    });
    
    if (instances.length === 0) {
      console.log(`  ℹ️  All instances already terminated`);
    } else {
      console.log(`  🛑 Terminating ${instances.length} running instance(s)...`);
      
      await ec2Client.send(new TerminateInstancesCommand({
        InstanceIds: instances.map(i => i.InstanceId!),
      }));
      
      instances.forEach(i => {
        console.log(`     - ${i.InstanceId} (${i.State?.Name})`);
      });
      
      console.log(`  ✅ Termination initiated`);
    }
    
    // Remove instance IDs from run record (using composite key: PK + SK)
    await dynamoClient.send(new UpdateCommand({
      TableName: RUNS_TABLE,
      Key: {
        PK: `RUN#${runId}`,
        SK: 'META',
      },
      UpdateExpression: 'REMOVE instanceIds SET instancesTerminatedAt = :time',
      ExpressionAttributeValues: {
        ':time': new Date().toISOString(),
      },
    }));
    
    console.log(`  ✅ Updated run record (removed instance IDs)`);
    
  } catch (error: any) {
    // If instances don't exist, that's okay - just remove from DB
    if (error.name === 'InvalidInstanceID.NotFound') {
      console.log(`  ℹ️  Instances not found (may have been manually terminated)`);
      
      await dynamoClient.send(new UpdateCommand({
        TableName: RUNS_TABLE,
        Key: {
          PK: `RUN#${runId}`,
          SK: 'META',
        },
        UpdateExpression: 'REMOVE instanceIds',
      }));
      
      console.log(`  ✅ Cleaned up run record`);
    } else {
      console.error(`  ❌ Failed to terminate instances for run ${runId}:`, error);
      throw error;
    }
  }
}

// Run the script
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});


