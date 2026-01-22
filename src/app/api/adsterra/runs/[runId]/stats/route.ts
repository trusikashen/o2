import { NextRequest, NextResponse } from 'next/server';
import { getAdsterraRun } from '@/lib/aws/adsterra-helpers';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

async function getQueueStatsByRunId(runId: string) {
  // Use GSI2 (runId index) - much more efficient than GSI1 + filter
  // Single query gets all jobs for this run, then count by status
  let allJobs: any[] = [];
  let lastEvaluatedKey: any = undefined;

  try {
    // Query all jobs for this run using GSI2
    do {
      const result = await ddbDocClient.send(
        new QueryCommand({
          TableName: JOBS_TABLE,
          IndexName: 'GSI2',
          KeyConditionExpression: 'GSI2PK = :runId',
          ExpressionAttributeValues: {
            ':runId': `RUN#${runId}`,
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      if (result.Items) {
        allJobs = allJobs.concat(result.Items);
      }
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    // Count by status (in memory - fast since we only have jobs for this run)
    const counts = {
      pending: 0,
      active: 0,
      completed: 0,
      failed: 0,
    };

    for (const job of allJobs) {
      const status = job.status || 'pending';
      if (status in counts) {
        counts[status as keyof typeof counts]++;
      }
    }

    return {
      waiting: counts.pending,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      total: allJobs.length,
    };
  } catch (error: any) {
    // Fallback if GSI2 doesn't exist (shouldn't happen, but handle gracefully)
    if (error.name === 'ValidationException' && error.message.includes('GSI2')) {
      console.warn('GSI2 not found, falling back to GSI1 (slower)');
      
      // Fallback to old method
      const statuses = ['pending', 'active', 'completed', 'failed'] as const;
      const counts: Record<(typeof statuses)[number], number> = {
        pending: 0,
        active: 0,
        completed: 0,
        failed: 0,
      };

      for (const status of statuses) {
        let totalCount = 0;
        let lastKey: any = undefined;

        do {
          const result = await ddbDocClient.send(
            new QueryCommand({
              TableName: JOBS_TABLE,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :status',
              FilterExpression: 'runId = :runId',
              ExpressionAttributeValues: {
                ':status': `STATUS#${status}`,
                ':runId': runId,
              },
              Select: 'COUNT',
              ExclusiveStartKey: lastKey,
            })
          );

          totalCount += result.Count || 0;
          lastKey = result.LastEvaluatedKey;
        } while (lastKey);

        counts[status] = totalCount;
      }

      return {
        waiting: counts.pending || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
      };
    }
    throw error;
  }
}

// GET /api/adsterra/runs/[runId]/stats - Get real-time stats for a run
export async function GET(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const run = await getAdsterraRun(params.runId);
    
    if (!run) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }

    // Get real-time stats from DynamoDB queue
    const queueStats = await getQueueStatsByRunId(params.runId);
    
    const totalSessions = run.config.totalBots * run.config.sessionsPerBot;
    const completed = queueStats.completed;
    const failed = queueStats.failed;
    const active = queueStats.active;
    const waiting = queueStats.waiting;
    
    // Calculate success rate
    const totalProcessed = completed + failed;
    const successRate = totalProcessed > 0 ? (completed / totalProcessed) * 100 : 0;
    
    // Calculate impressions (1 completed session = 1 impression)
    const impressions = completed;
    
    // Calculate estimated revenue (using CPM from config or default $2.365)
    const cpm = 2.365; // Actual CPM from user's data
    const estimatedRevenue = (impressions / 1000) * cpm;
    
    // Calculate data usage and cost
    const dataUsedMB = impressions * 0.05; // 0.05 MB per session
    const dataUsedGB = dataUsedMB / 1024;
    const estimatedCost = dataUsedGB * 8; // $8/GB
    const estimatedProfit = estimatedRevenue - estimatedCost;
    
    const stats = {
      totalSessions,
      completed,
      failed,
      active,
      waiting,
      successRate,
      impressions,
      estimatedRevenue,
      estimatedCost,
      estimatedProfit,
      dataUsedMB,
      dataUsedGB,
      averageSessionDuration: 0, // TODO: Track this from job completion times
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
