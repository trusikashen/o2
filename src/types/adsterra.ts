export interface AdsterraRun {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'running' | 'paused' | 'completed' | 'stopped' | 'cancelled' | 'failed';
  config: AdsterraConfig;
  createdAt: string;
  updatedAt: string;
  stats?: AdsterraStats;
  instanceIds?: string[]; // EC2 instance IDs managed by GitHub Actions
  instancesLaunchedAt?: string; // When instances were launched
  instancesTerminatedAt?: string; // When instances were terminated
  assignedWorkerIds?: string[]; // Optional: Worker IDs to which this run's jobs should be assigned (e.g., ["worker-0", "worker-1"])
}

export interface AdsterraConfig {
  adsterraUrl: string; // Direct Adsterra Smart Link URL
  blogHomepageUrl?: string; // Legacy blog URL support
  totalBots: number;
  sessionsPerBot: number;
  targetImpressions: number;
  browserHeadless: boolean;
  minScrollWait: number;
  maxScrollWait: number;
  minAdWait: number;
  maxAdWait: number;
  currentBotIndex?: number; // Current bot index being used
  concurrentJobs?: number; // Optional: dynamically calculated based on target impressions
  pacingMode?: 'fast' | 'human'; // fast = ignore schedule, human = spread sessions with schedule + jitter
  pacingHours?: number; // Optional: hours to spread impressions across (default: auto-calculated based on volume)
  distribution?: {
    countries: Record<string, number>;
    devices: Record<string, number>;
    browsers: Record<string, number>;
  };
}

export interface AdsterraStats {
  totalSessions: number;
  completed: number;
  failed: number;
  active: number;
  waiting: number;
  successRate: number;
  impressions: number;
  estimatedRevenue: number;
  averageSessionDuration: number;
  dataUsedMB: number; // Total data used in MB
  dataUsedGB: number; // Total data used in GB
  estimatedCost: number; // Estimated proxy cost
  estimatedProfit: number; // Estimated profit (revenue - cost)
}

export interface WorkerConfig {
  workerId: string; // e.g., "worker-0"
  adsterraUrl: string; // Individual smart link for this worker
  browserHeadless?: boolean;
  minScrollWait?: number;
  maxScrollWait?: number;
  minAdWait?: number;
  maxAdWait?: number;
  distribution?: {
    countries: Record<string, number>;
    devices: Record<string, number>;
    browsers: Record<string, number>;
  };
  pacingMode?: 'fast' | 'human'; // How to pace impressions (fast = immediate, human = spread out)
  pacingHours?: number; // Hours to spread impressions across (only for human mode)
  createdAt?: string;
  updatedAt?: string;
}
