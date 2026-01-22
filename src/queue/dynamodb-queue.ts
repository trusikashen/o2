import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { SessionJob } from '../types';
import type { JobStatus } from '../types';

const JOBS_TABLE = process.env.DYNAMODB_ADSTERRA_JOBS_TABLE || 'AdsterraJobs';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * Add a single job to the queue
 */
export async function addJob(job: SessionJob): Promise<void> {
  const now = new Date().toISOString();
  
  const item: any = {
    PK: `JOB#${job.id}`,
    SK: 'META',
    jobId: job.id,
    botId: job.botId,
    sessionNumber: job.sessionNumber,
    runId: job.runId, // Associate job with run
    scheduledTime: job.scheduledTime.toISOString(),
    status: job.status || 'pending',
    createdAt: now,
    updatedAt: now,
    // For querying by status and scheduled time
    GSI1PK: `STATUS#${job.status || 'pending'}`,
    GSI1SK: job.scheduledTime.toISOString(),
    // For querying by runId
    GSI2PK: `RUN#${job.runId}`,
    GSI2SK: job.scheduledTime.toISOString(),
    // Worker assignment fields
    assignedWorkerId: job.assignedWorkerId || null,
    assignedAt: job.assignedAt ? job.assignedAt.toISOString() : null,
    // Realistic session fields
    warmUpSites: job.warmUpSites || [],
    referrer: job.referrer || '',
    sessionSeed: job.sessionSeed || '',
    ctrEnabled: job.ctrEnabled || false,
    swipeCount: job.swipeCount || 10,
  };

  // Include distribution assignment if present
  if (job.distribution) {
    item.distribution = job.distribution;
  }
  
  await ddbDocClient.send(
    new PutCommand({
      TableName: JOBS_TABLE,
      Item: item,
    })
  );
}

/**
 * Add multiple jobs in batches
 */
export async function addBulkJobs(jobs: SessionJob[]): Promise<void> {
  const batchSize = 25; // DynamoDB batch write limit
  
  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    await Promise.all(batch.map(job => addJob(job)));
    
    // Small delay between batches to avoid throttling
    if (i + batchSize < jobs.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Get next waiting job (oldest scheduled time)
 * @param ignoreScheduledTime - If true, get any pending job regardless of scheduled time
 */
export async function getNextJob(ignoreScheduledTime = false): Promise<SessionJob | null> {
  const now = new Date().toISOString();
  
  let result;
  if (ignoreScheduledTime) {
    // Get any pending job, regardless of scheduled time
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 1,
        ScanIndexForward: true, // Oldest first
      })
    );
  } else {
    // Only get jobs scheduled for now or earlier
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :now',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':now': now,
        },
        Limit: 1,
        ScanIndexForward: true, // Oldest first
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const item = result.Items[0];
  return {
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
    distribution: item.distribution || undefined,
  };
}

/**
 * Get next waiting job for a specific run (uses GSI2 = RUN#<runId> / <scheduledTime>)
 *
 * Why: Without this, workers can steal jobs from older runs, leaving the newly-started run stuck at 0.
 *
 * Strategy:
 * - Query GSI2 for this run (oldest first)
 * - Find the first item with status=pending and (if not ignoreScheduledTime) scheduledTime <= now
 * - Return that job
 *
 * Note: GSI2 does not include status in the key, so we filter in-memory on the first page.
 * This is still fast because it's scoped to a single run and we only read a small page.
 */
export async function getNextJobForRun(
  runId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const nowIso = new Date().toISOString();
  const runPk = `RUN#${runId}`;

  // We only need a small batch to find the next pending job for this run.
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'GSI2',
      KeyConditionExpression: 'GSI2PK = :runId',
      ExpressionAttributeValues: {
        ':runId': runPk,
      },
      Limit: 25,
      ScanIndexForward: true, // Oldest first
    })
  );

  const items = result.Items || [];
  if (items.length === 0) return null;

  const candidate = items.find((item) => {
    if ((item.status || 'pending') !== 'pending') return false;
    if (ignoreScheduledTime) return true;
    return (item.scheduledTime || '') <= nowIso;
  });

  if (!candidate) return null;

  return {
    id: candidate.jobId,
    botId: candidate.botId,
    sessionNumber: candidate.sessionNumber,
    runId: candidate.runId,
    scheduledTime: new Date(candidate.scheduledTime),
    status: candidate.status,
    distribution: candidate.distribution || undefined,
  };
}

/**
 * Get next waiting job assigned to a specific worker
 * @param workerId - The worker ID to filter by (e.g., "worker-0", "worker-1")
 * @param ignoreScheduledTime - If true, get any pending job regardless of scheduled time
 *
 * Strategy:
 * - Query GSI1 for STATUS#pending jobs
 * - Filter in-memory for jobs where assignedWorkerId matches or is null (unassigned)
 * - Return the first matching job
 *
 * Note: For the most efficient queries with frequent worker-specific lookups,
 * consider adding a GSI3 with (assignedWorkerId, status) in the future.
 */
export async function getNextJobForWorker(
  workerId: string,
  ignoreScheduledTime = false
): Promise<SessionJob | null> {
  const now = new Date().toISOString();

  let result;
  if (ignoreScheduledTime) {
    // Get any pending job for this worker, regardless of scheduled time
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
        },
        Limit: 50, // Get more items to find one assigned to this worker
        ScanIndexForward: true, // Oldest first
      })
    );
  } else {
    // Only get jobs scheduled for now or earlier
    result = await ddbDocClient.send(
      new QueryCommand({
        TableName: JOBS_TABLE,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :status AND GSI1SK <= :now',
        ExpressionAttributeValues: {
          ':status': 'STATUS#pending',
          ':now': now,
        },
        Limit: 50, // Get more items to find one assigned to this worker
        ScanIndexForward: true, // Oldest first
      })
    );
  }

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  // Find first job that meets ONE of these conditions:
  // 1. Assigned to this specific worker
  // 2. Unassigned (assignedWorkerId is null or undefined) - for backward compatibility
  // Note: We do NOT return jobs assigned to OTHER workers
  const item = result.Items.find(
    (item) => {
      // If job is assigned to this worker, return it
      if (item.assignedWorkerId === workerId) return true;
      // If job is unassigned, return it (backward compatibility)
      if (!item.assignedWorkerId || item.assignedWorkerId === null) return true;
      // Don't return jobs assigned to other workers
      return false;
    }
  );

  if (!item) {
    return null;
  }

  return {
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
    distribution: item.distribution || undefined,
  };
}

/**
 * Mark job as active (being processed)
 * @param jobId - The job ID to mark as active
 * @param workerId - The ID of the worker claiming this job (e.g., "worker-0", "worker-1")
 * Returns true if successfully claimed, false if already claimed by another worker
 */
export async function markJobActive(jobId: string, workerId?: string): Promise<boolean> {
  const now = new Date().toISOString();
  
  try {
    if (workerId) {
      // When workerId is provided, ensure the job is either:
      // 1. Assigned to this specific worker, OR
      // 2. Unassigned (assignedWorkerId is null)
      // This prevents workers from stealing jobs assigned to other workers
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: JOBS_TABLE,
          Key: {
            PK: `JOB#${jobId}`,
            SK: 'META',
          },
          UpdateExpression: 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk, assignedWorkerId = :workerId, assignedAt = :assignedAt',
          ConditionExpression: '#status = :pending AND (assignedWorkerId = :workerId OR attribute_not_exists(assignedWorkerId))',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': 'active',
            ':pending': 'pending',
            ':now': now,
            ':gsi1pk': 'STATUS#active',
            ':workerId': workerId,
            ':assignedAt': now,
          },
        })
      );
    } else {
      // Without workerId, allow any worker to claim
      await ddbDocClient.send(
        new UpdateCommand({
          TableName: JOBS_TABLE,
          Key: {
            PK: `JOB#${jobId}`,
            SK: 'META',
          },
          UpdateExpression: 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk',
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: {
            '#status': 'status',
          },
          ExpressionAttributeValues: {
            ':status': 'active',
            ':pending': 'pending',
            ':now': now,
            ':gsi1pk': 'STATUS#active',
          },
        })
      );
    }
    return true; // Successfully claimed
  } catch (error: any) {
    // ConditionalCheckFailedException means another worker already claimed it
    if (error.name === 'ConditionalCheckFailedException') {
      return false; // Already claimed by another worker
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Mark job as completed
 */
export async function markJobCompleted(jobId: string): Promise<void> {
  const now = new Date().toISOString();
  
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: {
        PK: `JOB#${jobId}`,
        SK: 'META',
      },
      UpdateExpression: 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':now': now,
        ':gsi1pk': 'STATUS#completed',
      },
    })
  );
}

/**
 * Mark job as failed
 */
export async function markJobFailed(jobId: string, error?: string): Promise<void> {
  const now = new Date().toISOString();
  
  await ddbDocClient.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: {
        PK: `JOB#${jobId}`,
        SK: 'META',
      },
      UpdateExpression: 'SET #status = :status, updatedAt = :now, GSI1PK = :gsi1pk, errorMessage = :error',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':status': 'failed',
        ':now': now,
        ':gsi1pk': 'STATUS#failed',
        ':error': error || 'Unknown error',
      },
    })
  );
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<JobStatus> {
  const statuses = ['pending', 'active', 'completed', 'failed'];
  
  const counts = await Promise.all(
    statuses.map(async (status) => {
      let totalCount = 0;
      let lastEvaluatedKey: any = undefined;
      
      // Handle pagination - DynamoDB queries can return up to 1MB per page
      do {
        const result = await ddbDocClient.send(
          new QueryCommand({
            TableName: JOBS_TABLE,
            IndexName: 'GSI1',
            KeyConditionExpression: 'GSI1PK = :status',
            ExpressionAttributeValues: {
              ':status': `STATUS#${status}`,
            },
            Select: 'COUNT',
            ExclusiveStartKey: lastEvaluatedKey,
          })
        );
        
        totalCount += result.Count || 0;
        lastEvaluatedKey = result.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      
      return { status, count: totalCount };
    })
  );

  const stats: any = {};
  let total = 0;
  
  counts.forEach(({ status, count }) => {
    stats[status] = count;
    total += count;
  });

  return {
    waiting: stats.pending || 0, // Map 'pending' to 'waiting' for compatibility
    active: stats.active || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    total,
  };
}

/**
 * Get queue statistics for a specific run
 * Note: This scans all jobs and filters by runId (less efficient but works without GSI2)
 */
export async function getQueueStatsByRunId(runId: string): Promise<JobStatus> {
  const statuses = ['pending', 'active', 'completed', 'failed'];
  
  // Try GSI2 first, fallback to scan if it doesn't exist
  let useGSI2 = true;
  const counts = await Promise.all(
    statuses.map(async (status) => {
      try {
        if (useGSI2) {
          const result = await ddbDocClient.send(
            new QueryCommand({
              TableName: JOBS_TABLE,
              IndexName: 'GSI2',
              KeyConditionExpression: 'GSI2PK = :runId',
              FilterExpression: '#status = :status',
              ExpressionAttributeNames: {
                '#status': 'status',
              },
              ExpressionAttributeValues: {
                ':runId': `RUN#${runId}`,
                ':status': status,
              },
              Select: 'COUNT',
            })
          );
          return { status, count: result.Count || 0 };
        }
      } catch (error: any) {
        if (error.name === 'ValidationException' && error.message.includes('GSI2')) {
          useGSI2 = false;
          // Fallback: Query by status and filter in memory (less efficient)
          const result = await ddbDocClient.send(
            new QueryCommand({
              TableName: JOBS_TABLE,
              IndexName: 'GSI1',
              KeyConditionExpression: 'GSI1PK = :status',
              ExpressionAttributeValues: {
                ':status': `STATUS#${status}`,
              },
              Select: 'ALL_ATTRIBUTES',
            })
          );
          
          // Filter by runId in memory
          const matchingJobs = (result.Items || []).filter(item => item.runId === runId);
          return { status, count: matchingJobs.length };
        }
        throw error;
      }
      
      // If GSI2 doesn't exist, use fallback
      const result = await ddbDocClient.send(
        new QueryCommand({
          TableName: JOBS_TABLE,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :status',
          ExpressionAttributeValues: {
            ':status': `STATUS#${status}`,
          },
          Select: 'ALL_ATTRIBUTES',
        })
      );
      
      // Filter by runId in memory
      const matchingJobs = (result.Items || []).filter(item => item.runId === runId);
      return { status, count: matchingJobs.length };
    })
  );

  const stats: any = {};
  let total = 0;
  
  counts.forEach(({ status, count }) => {
    stats[status] = count;
    total += count;
  });

  return {
    waiting: stats.pending || 0,
    active: stats.active || 0,
    completed: stats.completed || 0,
    failed: stats.failed || 0,
    total,
  };
}

/**
 * Get jobs by status (for monitoring)
 */
export async function getJobsByStatus(status: 'pending' | 'active' | 'completed' | 'failed', limit = 100): Promise<SessionJob[]> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: JOBS_TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :status',
      ExpressionAttributeValues: {
        ':status': `STATUS#${status}`,
      },
      Limit: limit,
    })
  );

  if (!result.Items) return [];

  return result.Items.map(item => ({
    id: item.jobId,
    botId: item.botId,
    sessionNumber: item.sessionNumber,
    runId: item.runId,
    scheduledTime: new Date(item.scheduledTime),
    status: item.status,
  }));
}
