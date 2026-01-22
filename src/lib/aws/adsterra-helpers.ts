/**
 * DynamoDB helpers for Adsterra Bot System
 */

import { ddbDocClient } from './dynamo';
import { PutCommand, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import type { AdsterraRun, AdsterraStats, WorkerConfig } from '@/types/adsterra';

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
    name?: string;
    status?: AdsterraRun['status'];
    stats?: AdsterraStats;
  }
) {
  const now = new Date().toISOString();
  const updateExpressions: string[] = ['updatedAt = :now'];
  const expressionValues: any = { ':now': now };
  const expressionNames: any = {};

  if (updates.name) {
    updateExpressions.push('#n = :name');
    expressionValues[':name'] = updates.name;
    expressionNames['#n'] = 'name';
  }

  if (updates.status) {
    updateExpressions.push('#status = :status');
    expressionValues[':status'] = updates.status;
    expressionNames['#status'] = 'status';
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
      ...(Object.keys(expressionNames).length > 0 && { ExpressionAttributeNames: expressionNames }),
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

// Worker Configuration Functions

export const WORKERS_CONFIG_TABLE = process.env.DYNAMODB_WORKERS_CONFIG_TABLE || 'WorkersConfig';

/**
 * Create or overwrite a worker configuration
 */
export async function createWorkerConfig(config: WorkerConfig) {
  const now = new Date().toISOString();
  const item = {
    PK: `WORKER#${config.workerId}`,
    SK: 'CONFIG',
    ...config,
    createdAt: now,
    updatedAt: now,
  };

  await ddbDocClient.send(
    new PutCommand({
      TableName: WORKERS_CONFIG_TABLE,
      Item: item,
    })
  );

  return item;
}

/**
 * Get a worker configuration by worker ID
 */
export async function getWorkerConfig(workerId: string): Promise<WorkerConfig | null> {
  const result = await ddbDocClient.send(
    new QueryCommand({
      TableName: WORKERS_CONFIG_TABLE,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': `WORKER#${workerId}`,
        ':sk': 'CONFIG',
      },
    })
  );

  if (!result.Items || result.Items.length === 0) return null;

  const { PK, SK, ...config } = result.Items[0];
  return config as WorkerConfig;
}

/**
 * Get all worker configurations
 */
export async function getAllWorkerConfigs(): Promise<WorkerConfig[]> {
  try {
    const result = await ddbDocClient.send(
      new ScanCommand({
        TableName: WORKERS_CONFIG_TABLE,
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: {
          ':sk': 'CONFIG',
        },
      })
    );

    if (!result.Items) return [];

    return result.Items.map((item) => {
      const { PK, SK, ...config } = item;
      return config as WorkerConfig;
    });
  } catch (error: any) {
    // Table doesn't exist yet - return empty array
    // This allows the UI to load without the table
    if (error.__type === 'com.amazonaws.dynamodb.v20120810#ResourceNotFoundException') {
      return [];
    }
    throw error;
  }
}

/**
 * Update a worker configuration
 */
export async function updateWorkerConfig(
  workerId: string,
  updates: Partial<WorkerConfig>
) {
  const now = new Date().toISOString();
  const updateExpressions: string[] = ['updatedAt = :now'];
  const expressionValues: any = { ':now': now };

  if (updates.adsterraUrl) {
    updateExpressions.push('adsterraUrl = :url');
    expressionValues[':url'] = updates.adsterraUrl;
  }

  if (updates.browserHeadless !== undefined) {
    updateExpressions.push('browserHeadless = :headless');
    expressionValues[':headless'] = updates.browserHeadless;
  }

  if (updates.minScrollWait !== undefined) {
    updateExpressions.push('minScrollWait = :minScroll');
    expressionValues[':minScroll'] = updates.minScrollWait;
  }

  if (updates.maxScrollWait !== undefined) {
    updateExpressions.push('maxScrollWait = :maxScroll');
    expressionValues[':maxScroll'] = updates.maxScrollWait;
  }

  if (updates.minAdWait !== undefined) {
    updateExpressions.push('minAdWait = :minAd');
    expressionValues[':minAd'] = updates.minAdWait;
  }

  if (updates.maxAdWait !== undefined) {
    updateExpressions.push('maxAdWait = :maxAd');
    expressionValues[':maxAd'] = updates.maxAdWait;
  }

  if (updates.distribution) {
    updateExpressions.push('distribution = :distribution');
    expressionValues[':distribution'] = updates.distribution;
  }

  if (updates.pacingMode) {
    updateExpressions.push('pacingMode = :pacingMode');
    expressionValues[':pacingMode'] = updates.pacingMode;
  }

  if (updates.pacingHours !== undefined) {
    updateExpressions.push('pacingHours = :pacingHours');
    expressionValues[':pacingHours'] = updates.pacingHours;
  }

  await ddbDocClient.send(
    new UpdateCommand({
      TableName: WORKERS_CONFIG_TABLE,
      Key: {
        PK: `WORKER#${workerId}`,
        SK: 'CONFIG',
      },
      UpdateExpression: `set ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues,
    })
  );
}

/**
 * Delete a worker configuration
 */
export async function deleteWorkerConfig(workerId: string) {
  await ddbDocClient.send(
    new DeleteCommand({
      TableName: WORKERS_CONFIG_TABLE,
      Key: {
        PK: `WORKER#${workerId}`,
        SK: 'CONFIG',
      },
    })
  );
}

