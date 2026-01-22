export interface IPRoyalConfig {
  server: string;
  httpsPort: number;
  socks5Port: number;
  username: string;
  password: string;
  apiKey: string;
  orderId: string;
}

export interface DataImpulseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  countryCode?: string; // e.g., 'us' for United States
}

export interface BrightDataConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  zone?: string; // e.g., 'residential_proxy1'
}

export interface BotConfig {
  totalBots: number;
  sessionsPerBot: number;
  targetImpressions: number;
  blogHomepageUrl: string;
  smartLinkText: string;
  adsterraSmartLink: string; // Default Adsterra Smart Link URL from env (can be overridden by frontend)
  browserHeadless: boolean;
  browserTimeout: number;
}

export interface SessionJob {
  id: string;
  botId: string;
  sessionNumber: number;
  runId?: string; // Associate job with a run
  targetUrl?: string;
  scheduledTime: Date;
  status: 'pending' | 'processing' | 'active' | 'completed' | 'failed';
  // Worker assignment fields
  assignedWorkerId?: string; // Worker ID that claimed this job (e.g., "worker-0", "worker-1")
  assignedAt?: Date; // When the job was assigned to a worker
  // Distribution assignment (if using distribution system)
  distribution?: {
    country: string;
    deviceType: string;
    deviceName: string;
    browserType: string;
  };
  // Realistic session system fields
  warmUpSites: string[]; // 3-5 realistic websites for pre-warming (WITHOUT proxy)
  referrer: string; // Referrer URL for smartlink navigation (Google, Facebook, etc.)
  sessionSeed: string; // Deterministic seed for randomization per device
  ctrEnabled: boolean; // Whether to simulate a click (5-10% of sessions)
  swipeCount: number; // Number of mobile swipes (0 for 45% bots, 1-6 for 55% bots) - realistic pattern
}

export interface SessionResult {
  success: boolean;
  botId: string;
  sessionNumber: number;
  articleUrl?: string;
  ipAddress?: string;
  duration?: number;
  error?: string;
  timestamp: Date;
}

export interface ArticleLink {
  href: string;
  text: string;
}

export interface AdsterraConfig {
  adsterraUrl?: string;
  browserHeadless?: boolean;
  browserTimeout?: number;
  minScrollWait?: number;
  maxScrollWait?: number;
  minAdWait?: number;
  maxAdWait?: number;
  totalBots?: number;
  sessionsPerBot?: number;
  targetImpressions?: number;
  concurrentJobs?: number; // Optional: dynamically calculated based on target impressions
  pacingMode?: 'fast' | 'human'; // 'fast' = process immediately, 'human' = respect scheduled times (12-24h spread)
  pacingHours?: number; // Optional: hours to spread impressions across (default: auto-calculated based on volume)
  distribution?: {
    countries: Record<string, number>;
    devices: Record<string, number>;
    browsers: Record<string, number>;
  };
  distributionMatrix?: {
    entries: Array<{
      country: string;
      deviceType: string;
      deviceName: string;
      browserType: string;
      count: number;
    }>;
    total: number;
  };
}

export interface AdsterraRun {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'running' | 'paused' | 'completed' | 'stopped' | 'cancelled';
  config: AdsterraConfig;
  createdAt: string;
  updatedAt: string;
  stats?: AdsterraStats;
  instanceIds?: string[]; // EC2 instance IDs managed by GitHub Actions
  instancesLaunchedAt?: string; // When instances were launched
  instancesTerminatedAt?: string; // When instances were terminated
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

export interface JobStatus {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total: number;
}

