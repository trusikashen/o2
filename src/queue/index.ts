/**
 * Queue exports - now using DynamoDB instead of Redis
 * This file maintains backward compatibility while using DynamoDB
 */

// Re-export DynamoDB queue functions
export {
  addJob as addSessionJob,
  addBulkJobs as addBulkSessionJobs,
  getNextJob,
  markJobActive,
  markJobCompleted,
  markJobFailed,
  getQueueStats,
  getJobsByStatus,
} from './dynamodb-queue';

export type { JobStatus } from '../types';

