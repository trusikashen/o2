/**
 * Dynamically fetch and calculate optimal concurrency from active runs
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { AdsterraRun } from '../types';
import { calculateOptimalConcurrency } from './concurrency-calculator';

const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

const ddbClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * Get all active or pending runs from DynamoDB
 */
export async function getAllActiveRuns(): Promise<AdsterraRun[]> {
  const result = await ddbDocClient.send(
    new ScanCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      FilterExpression: '#status IN (:running, :pending)',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':running': 'running', ':pending': 'pending' },
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return [];
  }

  return result.Items.map((item) => ({
    id: item.id,
    name: item.name,
    status: item.status,
    config: item.config,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    stats: item.stats,
  })) as AdsterraRun[];
}

/**
 * Calculate the maximum concurrency needed from all active runs
 * Returns the maximum concurrentJobs value, or calculates it from targetImpressions
 */
export async function getMaxConcurrencyFromActiveRuns(): Promise<number> {
  try {
    const activeRuns = await getAllActiveRuns();

    if (activeRuns.length === 0) {
      // No active runs - use default from env or minimum
      const defaultConcurrency = parseInt(process.env.CONCURRENT_JOBS || '2', 10);
      return Math.max(2, defaultConcurrency);
    }

    // Get max concurrency from all active runs
    const concurrencyValues = activeRuns.map((run) => {
      // Use explicit concurrentJobs if set, otherwise calculate from targetImpressions
      if (run.config.concurrentJobs) {
        return run.config.concurrentJobs;
      }
      if (run.config.targetImpressions) {
        return calculateOptimalConcurrency(run.config.targetImpressions);
      }
      // Fallback to default if neither is available
      return parseInt(process.env.CONCURRENT_JOBS || '2', 10);
    });

    const maxConcurrency = Math.max(...concurrencyValues);

    // Apply constraints
    const MIN_CONCURRENCY = 2;
    const MAX_CONCURRENCY = parseInt(
      process.env.MAX_CONCURRENT_JOBS || '500',
      10
    ); // Configurable max (default 500 for $500/day in 24h)
    return Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, maxConcurrency));
  } catch (error: any) {
    console.error('Error fetching active runs for concurrency calculation:', error.message);
    // Fallback to env var on error
    return parseInt(process.env.CONCURRENT_JOBS || '2', 10);
  }
}
