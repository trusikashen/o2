/**
 * DynamoDB helpers for Adsterra Bot System
 */

import { ddbDocClient } from './dynamo';
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { AdsterraRun, AdsterraStats } from '@/types/adsterra';

// Table name from environment variable
// Default to 'AdsterraRuns' if not set
export const ADSTERRA_RUNS_TABLE = process.env.DYNAMODB_ADSTERRA_RUNS_TABLE || 'AdsterraRuns';

/**
 * Create an Adsterra run
 */
export async function createAdsterraRun(run: Omit<AdsterraRun, 'createdAt' | 'updatedAt'>) {
  const now = new Date().toISOString();
  const item = {
    PK: `RUN#${run.id}`,
    SK: 'META',
    ...run,
    createdAt: now,
    updatedAt: now,
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      Item: item,
    })
  );

  return item;
}

/**
 * Get an Adsterra run by ID
 */
export async function getAdsterraRun(runId: string): Promise<AdsterraRun | null> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `RUN#${runId}`,
        ':sk': 'META',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  const { PK, SK, ...run } = result.Items[0];
  return run as AdsterraRun;
}

/**
 * Get all Adsterra runs
 */
export async function getAllAdsterraRuns(): Promise<AdsterraRun[]> {
  const result = await ddbDocClient.send(
    new ScanCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: {
        ':sk': 'META',
      },
    })
  );

  if (!result.Items) return [];

  return result.Items.map((item) => {
    const { PK, SK, ...run } = item;
    return run as AdsterraRun;
  });
}

/**
 * Update Adsterra run
 */
export async function updateAdsterraRun(
  runId: string,
  updates: {
    status?: AdsterraRun['status'];
    stats?: AdsterraStats;
  }
) {
  const now = new Date().toISOString();
  const updateExpressions: string[] = ['updatedAt = :now'];
  const expressionValues: any = { ':now': now };

  if (updates.status) {
    updateExpressions.push('#status = :status');
    expressionValues[':status'] = updates.status;
  }

  if (updates.stats) {
    updateExpressions.push('stats = :stats');
    expressionValues[':stats'] = updates.stats;
  }

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      Key: {
        PK: `RUN#${runId}`,
        SK: 'META',
      },
      UpdateExpression: `set ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
      ExpressionAttributeNames: {
        '#status': 'status',
      },
    })
  );
}

/**
 * Delete an Adsterra run
 */
export async function deleteAdsterraRun(runId: string) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: ADSTERRA_RUNS_TABLE,
      Key: {
        PK: `RUN#${runId}`,
        SK: 'META',
      },
    })
  );
}

