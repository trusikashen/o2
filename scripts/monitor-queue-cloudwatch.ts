// Monitor DynamoDB queue size and push to CloudWatch.
// Run every 5 minutes (cron/systemd).
// Usage: npm run monitor:queue
// Cron example (every 5 min):
//   */5 * * * * cd /home/ubuntu/adsterra && npm run monitor:queue

import 'dotenv/config';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { getQueueStats } from '../src/queue/dynamodb-queue';

const CLOUDWATCH_NAMESPACE = 'Adsterra/Bot';
const METRIC_NAME = 'QueueSize';
const REGION = process.env.AWS_REGION || 'us-east-1';

const cloudwatch = new CloudWatchClient({ region: REGION });

async function pushQueueMetricToCloudWatch() {
  try {
    // Get queue stats from DynamoDB
    const stats = await getQueueStats();
    const totalPending = stats.waiting + stats.active;

    console.log(`📊 Queue Stats: ${totalPending} pending jobs (${stats.waiting} waiting, ${stats.active} active)`);

    // Push metric to CloudWatch
    const command = new PutMetricDataCommand({
      Namespace: CLOUDWATCH_NAMESPACE,
      MetricData: [
        {
          MetricName: METRIC_NAME,
          Value: totalPending,
          Unit: 'Count',
          Timestamp: new Date(),
        },
      ],
    });

    await cloudwatch.send(command);
    console.log(`✅ Pushed metric to CloudWatch: ${METRIC_NAME} = ${totalPending}`);
  } catch (error: any) {
    console.error('❌ Error pushing metric to CloudWatch:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  pushQueueMetricToCloudWatch();
}

export { pushQueueMetricToCloudWatch };
