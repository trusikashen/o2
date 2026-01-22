import { NextRequest, NextResponse } from 'next/server';
import { getAdsterraRun, updateAdsterraRun, deleteAdsterraRun } from '@/lib/aws/adsterra-helpers';

// GET /api/adsterra/runs/[runId] - Get run details
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

    // Fetch real-time stats from DynamoDB queue (optimized using GSI2)
    try {
      const { DynamoDBClient } = await import('@aws-sdk/client-dynamodb');
      const { DynamoDBDocumentClient, QueryCommand } = await import('@aws-sdk/lib-dynamodb');
      
      const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';
      const ddbClient = new DynamoDBClient({
        region: process.env.AWS_REGION || 'us-east-1',
      });
      const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
      
      // Use GSI2 (runId index) - single efficient query instead of 4 separate queries
      let allJobs: any[] = [];
      let lastEvaluatedKey: any = undefined;

      try {
        do {
          const result = await ddbDocClient.send(
            new QueryCommand({
              TableName: JOBS_TABLE,
              IndexName: 'GSI2',
              KeyConditionExpression: 'GSI2PK = :runId',
              ExpressionAttributeValues: {
                ':runId': `RUN#${params.runId}`,
              },
              ExclusiveStartKey: lastEvaluatedKey,
            })
          );

          if (result.Items) {
            allJobs = allJobs.concat(result.Items);
          }
          lastEvaluatedKey = result.LastEvaluatedKey;
        } while (lastEvaluatedKey);

        // Count by status (fast in-memory operation)
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

        const queueStats = {
          waiting: counts.pending,
          active: counts.active,
          completed: counts.completed,
          failed: counts.failed,
          total: allJobs.length,
        };
      
        const totalSessions = run.config.totalBots * run.config.sessionsPerBot;
        const completed = queueStats.completed;
        const failed = queueStats.failed;
        const active = queueStats.active;
        const waiting = queueStats.waiting;
        
        const totalProcessed = completed + failed;
        const successRate = totalProcessed > 0 ? (completed / totalProcessed) * 100 : 0;
        const impressions = completed;
        const cpm = 2.365; // Actual CPM
        const estimatedRevenue = (impressions / 1000) * cpm;
        const dataUsedMB = impressions * 0.05;
        const dataUsedGB = dataUsedMB / 1024;
        const estimatedCost = dataUsedGB * 8;
        const estimatedProfit = estimatedRevenue - estimatedCost;
        
        run.stats = {
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
          averageSessionDuration: 0,
        };
      } catch (gsi2Error: any) {
        // Fallback if GSI2 doesn't exist (shouldn't happen, but handle gracefully)
        if (gsi2Error.name === 'ValidationException' && gsi2Error.message.includes('GSI2')) {
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
                    ':runId': params.runId,
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

          const queueStats = {
            waiting: counts.pending || 0,
            active: counts.active || 0,
            completed: counts.completed || 0,
            failed: counts.failed || 0,
            total: Object.values(counts).reduce((a, b) => a + b, 0),
          };
          
          const totalSessions = run.config.totalBots * run.config.sessionsPerBot;
          const completed = queueStats.completed;
          const failed = queueStats.failed;
          const active = queueStats.active;
          const waiting = queueStats.waiting;
          
          const totalProcessed = completed + failed;
          const successRate = totalProcessed > 0 ? (completed / totalProcessed) * 100 : 0;
          const impressions = completed;
          const cpm = 2.365;
          const estimatedRevenue = (impressions / 1000) * cpm;
          const dataUsedMB = impressions * 0.05;
          const dataUsedGB = dataUsedMB / 1024;
          const estimatedCost = dataUsedGB * 8;
          const estimatedProfit = estimatedRevenue - estimatedCost;
          
          run.stats = {
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
            averageSessionDuration: 0,
          };
        } else {
          throw gsi2Error;
        }
      }
    } catch (statsError) {
      // If stats fetch fails, use placeholder
      if (!run.stats) {
        run.stats = {
          totalSessions: run.config.totalBots * run.config.sessionsPerBot,
          completed: 0,
          failed: 0,
          active: 0,
          waiting: 0,
          successRate: 0,
          impressions: 0,
          estimatedRevenue: 0,
          estimatedCost: 0,
          estimatedProfit: 0,
          dataUsedMB: 0,
          dataUsedGB: 0,
          averageSessionDuration: 0,
        };
      }
    }

    return NextResponse.json(run);
  } catch (error: any) {
    console.error('Error fetching run:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/adsterra/runs/[runId] - Update run (e.g., rename)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const body = await request.json();
    const { name } = body;
    
    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Invalid name provided' },
        { status: 400 }
      );
    }
    
    // Update the run with new name
    await updateAdsterraRun(params.runId, { name });
    
    // Fetch and return the updated run
    const updatedRun = await getAdsterraRun(params.runId);
    
    if (!updatedRun) {
      return NextResponse.json(
        { error: 'Run not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(updatedRun);
  } catch (error: any) {
    console.error('Error updating run:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/adsterra/runs/[runId] - Delete run
export async function DELETE(
  request: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    await deleteAdsterraRun(params.runId);
    
    // TODO: Also clear jobs from Redis queue
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting run:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
