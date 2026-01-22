/**
 * GET /api/workers/status
 * Returns the status of all online workers
 * Frontend uses this to determine which workers are running and their location
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { WorkerStatus } from '@/types/worker-status';

const REGION = process.env.AWS_REGION || 'us-east-1';
const WORKER_STATUS_TABLE = process.env.DYNAMODB_WORKER_STATUS_TABLE || 'WorkerStatus';

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export async function GET(request: NextRequest) {
  try {
    // Get list of expected workers
    // We know we have worker-0 through worker-14 locally
    const EXPECTED_WORKER_IDS = Array.from({ length: 15 }, (_, i) => `worker-${i}`);
    
    const statuses: WorkerStatus[] = [];
    const now = new Date();

    // Query status for each worker
    for (const workerId of EXPECTED_WORKER_IDS) {
      try {
        const result = await ddbDocClient.send(
          new QueryCommand({
            TableName: WORKER_STATUS_TABLE,
            KeyConditionExpression: 'PK = :pk AND SK = :sk',
            ExpressionAttributeValues: {
              ':pk': `WORKER#${workerId}`,
              ':sk': 'STATUS',
            },
            Limit: 1,
          })
        );

        if (result.Items && result.Items.length > 0) {
          const item = result.Items[0];
          const lastHeartbeat = new Date(item.lastHeartbeat);
          const timeSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / 1000;
          
          // Worker is online if heartbeat is within 30 seconds
          const isOnline = timeSinceHeartbeat < 30;

          statuses.push({
            workerId,
            isOnline,
            location: item.location || 'local',
            lastHeartbeat: item.lastHeartbeat,
            cpuUsage: item.cpuUsage,
            memoryUsage: item.memoryUsage,
            jobsProcessed: item.jobsProcessedInSession || 0,
            currentJobId: item.currentJobId,
            currentRunId: item.currentRunId,
            ec2InstanceId: item.ec2InstanceId,
            ec2Region: item.ec2Region,
            pmId: item.pmId,
            nodeVersion: item.nodeVersion,
          });
        } else {
          // No heartbeat recorded - worker is offline
          statuses.push({
            workerId,
            isOnline: false,
            location: 'local',
            lastHeartbeat: new Date(0).toISOString(),
          });
        }
      } catch (err) {
        // Error querying this worker - treat as offline
        statuses.push({
          workerId,
          isOnline: false,
          location: 'local',
          lastHeartbeat: new Date(0).toISOString(),
        });
      }
    }

    return NextResponse.json({
      workers: statuses,
      timestamp: now.toISOString(),
      onlineCount: statuses.filter(w => w.isOnline).length,
      awsCount: statuses.filter(w => w.isOnline && w.location === 'aws').length,
      localCount: statuses.filter(w => w.isOnline && w.location === 'local').length,
    });
  } catch (error) {
    console.error('Error fetching worker statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch worker statuses' },
      { status: 500 }
    );
  }
}
