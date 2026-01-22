/**
 * Adsterra Profit Configurations
 * Based on real data: $1.5 CPM, $2.00 profit per GB (optimized)
 */

export interface AdsterraProfitConfig {
  id: string;
  name: string;
  targetProfit: number; // Daily profit target in USD
  description: string;
  
  // Bot configuration
  totalBots: number;
  sessionsPerBot: number;
  targetImpressions: number;
  
  // Timing configuration (based on flow)
  minScrollWait: number; // ms - time to scroll and find Smart Link
  maxScrollWait: number; // ms
  minAdWait: number; // ms - time on advertiser page (20-60 seconds for impression)
  maxAdWait: number; // ms
  
  // Cost estimates
  ipRoyalCost: number; // Daily IPRoyal cost (unlimited plan)
  estimatedDailyRevenue: number; // Based on impressions × CPM
  estimatedDailyProfit: number; // Revenue - IPRoyal cost
  
  // Assumptions
  assumedCPM: number; // $1.5 based on real data
  dataUsedGB: number; // Estimated data usage
  
  // Notes
  notes?: string[];
}

// Based on real data analysis (Direct Link Approach):
// - CPM: $2.365 (from actual account data - Desktop only)
// - Data usage: 0.05 MB per session (direct link, resource blocking)
// - BrightData cost: $8/GB
// - Cost per session: $0.0004 (0.05 MB × $8/GB)
// - Revenue per impression: $0.002365 ($2.365 CPM ÷ 1000)
// - Profit per impression: $0.001965
// - 1 impression = 1 direct link visit = 1 session

const ASSUMED_CPM = 2.365; // Actual CPM from user's data
const BRIGHTDATA_COST_PER_GB = 8.00; // BrightData residential proxy cost
const DATA_USAGE_PER_SESSION_MB = 0.05; // Actual measured data usage
const COST_PER_SESSION = (DATA_USAGE_PER_SESSION_MB / 1000) * BRIGHTDATA_COST_PER_GB; // $0.0004
const REVENUE_PER_IMPRESSION = ASSUMED_CPM / 1000; // $0.002365
const PROFIT_PER_IMPRESSION = REVENUE_PER_IMPRESSION - COST_PER_SESSION; // $0.001965

export const ADSTERRA_PROFIT_CONFIGS: AdsterraProfitConfig[] = [
  {
    id: 'adsterra-test-1bot',
    name: 'Test (1 Bot)',
    targetProfit: 0,
    description: 'Single bot test - perfect for watching bot behavior',
    totalBots: 1,
    sessionsPerBot: 1,
    targetImpressions: 1,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000, // 20 seconds
    maxAdWait: 60000, // 60 seconds
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 0.002365, // 1 impression × $2.365 / 1000
    estimatedDailyProfit: 0.001965, // Revenue - cost ($0.002365 - $0.0004)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 0.00005, // 1 impression × 0.05 MB
    notes: [
      'Perfect for testing bot behavior',
      '1 bot, 1 session - watch it work!',
      'Set browserHeadless=false to see browser',
      'Direct link approach - no blog navigation',
      'Desktop only (mobile doesn\'t register CPM)',
    ],
  },
  {
    id: 'adsterra-test-10',
    name: 'Test (10 Impressions)',
    targetProfit: 0,
    description: 'Quick test for headless mode - perfect for local testing',
    totalBots: 1,
    sessionsPerBot: 10,
    targetImpressions: 10,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000, // 20 seconds
    maxAdWait: 60000, // 60 seconds
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 0.02365, // 10 impressions × $2.365 / 1000
    estimatedDailyProfit: 0.01965, // Revenue - cost ($0.02365 - $0.004)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 0.0005, // 10 impressions × 0.05 MB
    notes: [
      'Perfect for testing headless mode locally',
      'Quick test - 10 impressions only',
      'Direct link approach - minimal data usage',
      'Use "Test Locally" button to run on your machine',
    ],
  },
  {
    id: 'adsterra-test',
    name: 'Test (100 Impressions)',
    targetProfit: 0,
    description: 'Minimal configuration for testing',
    totalBots: 10,
    sessionsPerBot: 10,
    targetImpressions: 100,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000, // 20 seconds
    maxAdWait: 60000, // 60 seconds
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 0.2365, // 100 impressions × $2.365 / 1000
    estimatedDailyProfit: 0.1965, // Revenue - cost ($0.2365 - $0.04)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 0.005, // 100 impressions × 0.05 MB
    notes: [
      'Perfect for testing',
      'Low volume to verify setup',
      'Direct link approach - minimal data usage',
      'Desktop only (mobile doesn\'t register CPM)',
    ],
  },
  {
    id: 'adsterra-50',
    name: '$50/Day Profit',
    targetProfit: 50,
    description: 'Small scale profitable run - Direct Link Approach',
    totalBots: 2114, // 21,142 impressions ÷ 10 sessions per bot
    sessionsPerBot: 10,
    targetImpressions: 21142, // $50 revenue ÷ $0.002365 per impression
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000, // 20 seconds on Adsterra page
    maxAdWait: 60000, // 60 seconds on Adsterra page
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 50.00, // 21,142 impressions × $2.365 / 1000
    estimatedDailyProfit: 41.54, // $50.00 - $8.46 (proxy cost)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 1.057, // 21,142 impressions × 0.05 MB
    notes: [
      'Direct link approach - no blog navigation',
      'Desktop only (mobile doesn\'t register CPM)',
      'Resource blocking enabled (images, fonts, videos, analytics)',
      'BrightData residential proxies with unique IP per session',
      '83% profit margin',
      'Good for testing and validation',
    ],
  },
  {
    id: 'adsterra-100',
    name: '$100/Day Profit',
    targetProfit: 100,
    description: 'Medium scale profitable run - Direct Link Approach',
    totalBots: 4228, // 42,284 impressions ÷ 10 sessions per bot
    sessionsPerBot: 10,
    targetImpressions: 42284, // $100 revenue ÷ $0.002365 per impression
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000, // 20 seconds on Adsterra page
    maxAdWait: 60000, // 60 seconds on Adsterra page
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 100.00, // 42,284 impressions × $2.365 / 1000
    estimatedDailyProfit: 83.09, // $100.00 - $16.91 (proxy cost)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 2.114, // 42,284 impressions × 0.05 MB
    notes: [
      'Direct link approach - no blog navigation',
      'Desktop only (mobile doesn\'t register CPM)',
      'Resource blocking enabled (images, fonts, videos, analytics)',
      'BrightData residential proxies with unique IP per session',
      '83% profit margin',
      'Recommended for production after testing $50/day',
    ],
  },
  {
    id: 'adsterra-161',
    name: '$161/Day Profit (Real Example)',
    targetProfit: 161,
    description: 'Matches your real account example - Direct Link Approach',
    totalBots: 16000,
    sessionsPerBot: 10,
    targetImpressions: 160000,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000,
    maxAdWait: 60000,
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 378.40, // 160,000 impressions × $2.365 / 1000
    estimatedDailyProfit: 314.40, // $378.40 - $64.00 (proxy cost)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 8.0, // 160,000 impressions × 0.05 MB
    notes: [
      'Based on your real account data',
      'Direct link approach - no blog navigation',
      'Desktop only (mobile doesn\'t register CPM)',
      'Resource blocking enabled',
      'BrightData residential proxies',
    ],
  },
  {
    id: 'adsterra-200',
    name: '$200/Day Profit',
    targetProfit: 200,
    description: 'High scale profitable run - Direct Link Approach',
    totalBots: 20000,
    sessionsPerBot: 10,
    targetImpressions: 200000,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000,
    maxAdWait: 60000,
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 473.00, // 200,000 impressions × $2.365 / 1000
    estimatedDailyProfit: 393.00, // $473.00 - $80.00 (proxy cost)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 10.0, // 200,000 impressions × 0.05 MB
    notes: [
      'High volume, high profit',
      'Requires stable infrastructure',
      'Best ROI at scale',
      'Direct link approach',
      'Desktop only',
    ],
  },
  {
    id: 'adsterra-500',
    name: '$500/Day Profit',
    targetProfit: 500,
    description: 'Maximum scale profitable run - Direct Link Approach',
    totalBots: 50000,
    sessionsPerBot: 10,
    targetImpressions: 500000,
    minScrollWait: 0, // Direct link - no scrolling needed
    maxScrollWait: 0, // Direct link - no scrolling needed
    minAdWait: 20000,
    maxAdWait: 60000,
    ipRoyalCost: 0, // Using BrightData, not IPRoyal
    estimatedDailyRevenue: 1182.50, // 500,000 impressions × $2.365 / 1000
    estimatedDailyProfit: 982.50, // $1182.50 - $200.00 (proxy cost)
    assumedCPM: ASSUMED_CPM,
    dataUsedGB: 25.0, // 500,000 impressions × 0.05 MB
    notes: [
      'Maximum scale',
      'Requires robust infrastructure',
      'Highest profit potential',
      'Direct link approach',
      'Desktop only',
    ],
  },
];

export function getAllAdsterraProfitConfigs(): AdsterraProfitConfig[] {
  return ADSTERRA_PROFIT_CONFIGS;
}

export function getAdsterraProfitConfig(id: string): AdsterraProfitConfig | undefined {
  return ADSTERRA_PROFIT_CONFIGS.find(config => config.id === id);
}

