/**
 * POST /api/workers/heartbeat
 * Worker heartbeat endpoint - workers send their status
 * 
 * Frontend polls this to determine which workers are online and their location
 */

import { NextRequest, NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { WorkerHeartbeat } from '@/types/worker-status';

const REGION = process.env.AWS_REGION || 'us-east-1';
const WORKER_STATUS_TABLE = process.env.DYNAMODB_WORKER_STATUS_TABLE || 'WorkerStatus';

const ddbClient = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

export async function POST(request: NextRequest) {
  try {
    const heartbeat: WorkerHeartbeat = await request.json();
    
    // Validate required fields
    if (!heartbeat.workerId || !heartbeat.location) {
      return NextResponse.json(
        { error: 'Missing workerId or location' },
        { status: 400 }
      );
    }

    // Store in DynamoDB with 5-minute TTL
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 300; // 5 minutes

    await ddbDocClient.send(
      new PutCommand({
        TableName: WORKER_STATUS_TABLE,
        Item: {
          PK: `WORKER#${heartbeat.workerId}`,
          SK: 'STATUS',
          workerId: heartbeat.workerId,
          location: heartbeat.location,
          ec2InstanceId: heartbeat.ec2InstanceId,
          ec2Region: heartbeat.ec2Region,
          currentJobId: heartbeat.currentJobId,
          currentRunId: heartbeat.currentRunId,
          jobsProcessedInSession: heartbeat.jobsProcessedInSession || 0,
          uptime: heartbeat.uptime || 0,
          lastHeartbeat: now,
          TTL: ttl, // DynamoDB TTL attribute
        },
      })
    );

    return NextResponse.json({ 
      success: true, 
      message: `Heartbeat recorded for ${heartbeat.workerId}` 
    });
  } catch (error: any) {
    // Check if it's a resource not found error (table doesn't exist)
    if (error?.__type?.includes('ResourceNotFoundException')) {
      console.warn(`⚠️  Worker status table "${WORKER_STATUS_TABLE}" does not exist. Worker heartbeat not stored.`);
      console.warn('📝 To fix: Run "npm run init:worker-status-table" or create manually in AWS console');
      
      // Return success anyway - this allows workers to continue functioning
      // even if heartbeat storage fails
      return NextResponse.json({ 
        success: true,
        warning: 'Heartbeat table not configured - worker status not persisted'
      });
    }
    
    console.error('Error processing worker heartbeat:', error);
    return NextResponse.json(
      { error: 'Failed to record heartbeat' },
      { status: 500 }
    );
  }
}
