/**
 * Worker Status and Metadata Types
 * Used for tracking online/offline status and worker location
 */

export interface WorkerStatus {
  workerId: string;
  isOnline: boolean;
  location: 'local' | 'aws';
  lastHeartbeat: string; // ISO timestamp
  cpuUsage?: number; // percentage
  memoryUsage?: number; // bytes
  jobsProcessed?: number;
  currentJobId?: string;
  currentRunId?: string;
  // For AWS workers:
  ec2InstanceId?: string;
  ec2Region?: string;
  // For local workers:
  pmId?: string;
  nodeVersion?: string;
}

export interface WorkerHeartbeat {
  workerId: string;
  timestamp: string;
  location: 'local' | 'aws';
  ec2InstanceId?: string;
  ec2Region?: string;
  currentJobId?: string;
  currentRunId?: string;
  jobsProcessedInSession?: number;
  uptime?: number; // seconds
}
