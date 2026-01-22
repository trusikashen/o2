/**
 * Bot Risk Assessment System
 * Determines which bots need pre-warming to avoid anti-fraud detection
 * Low-risk bots skip expensive pre-warming to save proxy traffic costs
 */

import type { AdsterraConfig } from '@/types/adsterra';

export interface BotRiskProfile {
  riskScore: number; // 0-100 (0=safe, 100=very risky)
  isRisky: boolean; // true if should do pre-warming
  factors: RiskFactor[];
  recommendation: string;
}

export interface RiskFactor {
  name: string;
  score: number; // 0-100
  reason: string;
}

/**
 * Assess risk level for a specific bot
 */
export function assessBotRisk(
  botIndex: number,
  config: AdsterraConfig,
  dailyBotStats?: {
    totalBotsRunningToday: number;
    totalSessionsToday: number;
    avgSessionsPerBot: number;
  },
  proxyStats?: {
    daysOld: number;
    isNewProxy: boolean;
    reputationScore: number; // 0-100
  },
  browserInfo?: {
    browserType: 'chromium' | 'firefox' | 'webkit'; // Browser type
    platform: string; // Process platform (linux, win32, darwin)
  }
): BotRiskProfile {
  const factors: RiskFactor[] = [];

  // FACTOR 1: Session volume (higher = more suspicious)
  const sessionVolume = config.sessionsPerBot || 1;
  let volumeRisk = 0;
  let volumeReason = '';
  
  if (sessionVolume <= 5) {
    volumeRisk = 10; // Very low risk - few sessions
    volumeReason = 'Low session count (1-5)';
  } else if (sessionVolume <= 20) {
    volumeRisk = 25; // Low-medium risk
    volumeReason = 'Medium session count (6-20)';
  } else if (sessionVolume <= 50) {
    volumeRisk = 50; // Medium risk
    volumeReason = 'High session count (21-50)';
  } else {
    volumeRisk = 75; // High risk - too many sessions
    volumeReason = `Very high session count (${sessionVolume})`;
  }
  factors.push({ name: 'Session Volume', score: volumeRisk, reason: volumeReason });

  // FACTOR 2: Total bots in run (more bots = more detection risk)
  const totalBots = config.totalBots || 1;
  let botsRisk = 0;
  let botsReason = '';
  
  if (totalBots <= 10) {
    botsRisk = 10;
    botsReason = 'Small bot count (safe range)';
  } else if (totalBots <= 100) {
    botsRisk = 30;
    botsReason = 'Medium bot count (1000+ jobs)';
  } else if (totalBots <= 1000) {
    botsRisk = 60;
    botsReason = `Large bot count (${totalBots} bots)`;
  } else {
    botsRisk = 85;
    botsReason = `Massive bot count (${totalBots} bots) - very suspicious`;
  }
  factors.push({ name: 'Bot Population', score: botsRisk, reason: botsReason });

  // FACTOR 3: Pacing mode (fast pacing = more suspicious than human)
  const pacingMode = config.pacingMode || 'human';
  const pacingRisk = pacingMode === 'fast' ? 70 : 20;
  const pacingReason = pacingMode === 'fast' 
    ? 'Fast pacing (unnatural traffic pattern)' 
    : 'Human pacing (realistic delays)';
  factors.push({ name: 'Pacing Mode', score: pacingRisk, reason: pacingReason });

  // FACTOR 4: Bot index position (first bots in batch are more suspicious)
  // Theory: anti-fraud watches first few bots intensely
  let indexRisk = 0;
  let indexReason = '';
  
  if (botIndex === 0) {
    indexRisk = 80; // FIRST BOT - gets heavy scrutiny
    indexReason = 'First bot in batch (gets scrutiny)';
  } else if (botIndex === 1) {
    indexRisk = 70;
    indexReason = 'Second bot (still suspicious)';
  } else if (botIndex < 10) {
    indexRisk = 50;
    indexReason = 'Early bots (medium scrutiny)';
  } else if (botIndex < 100) {
    indexRisk = 30;
    indexReason = 'Mid-batch bots (lower scrutiny)';
  } else {
    indexRisk = 15;
    indexReason = 'Late bots (less scrutiny)';
  }
  factors.push({ name: 'Bot Index', score: indexRisk, reason: indexReason });

  // FACTOR 5: Proxy age (new proxies = more suspicious)
  let proxyRisk = 0;
  let proxyReason = '';
  
  if (proxyStats) {
    if (proxyStats.isNewProxy || proxyStats.daysOld < 3) {
      proxyRisk = 80;
      proxyReason = 'Brand new proxy (< 3 days)';
    } else if (proxyStats.daysOld < 7) {
      proxyRisk = 60;
      proxyReason = 'New proxy (< 1 week)';
    } else if (proxyStats.daysOld < 30) {
      proxyRisk = 35;
      proxyReason = 'Relatively new proxy (1-4 weeks)';
    } else {
      proxyRisk = 15;
      proxyReason = 'Established proxy (> 1 month)';
    }
    
    // Adjust by reputation score if available
    if (proxyStats.reputationScore < 50) {
      proxyRisk = Math.min(100, proxyRisk + 20);
      proxyReason += ' + low reputation';
    }
  } else {
    proxyRisk = 30;
    proxyReason = 'Proxy age unknown';
  }
  factors.push({ name: 'Proxy Age', score: proxyRisk, reason: proxyReason });

  // FACTOR 6: Headless mode (headless = more risky than headed)
  const headlessRisk = config.browserHeadless !== false ? 40 : 10;
  const headlessReason = config.browserHeadless !== false
    ? 'Headless browser (less realistic)'
    : 'Headed browser (more realistic)';
  factors.push({ name: 'Browser Mode', score: headlessRisk, reason: headlessReason });

  // FACTOR 7: Daily session velocity (doing too many sessions today = risky)
  let velocityRisk = 0;
  let velocityReason = '';
  
  if (dailyBotStats) {
    const sessionsPerHour = dailyBotStats.totalSessionsToday / 24;
    
    if (sessionsPerHour < 10) {
      velocityRisk = 10;
      velocityReason = 'Low daily velocity (safe)';
    } else if (sessionsPerHour < 100) {
      velocityRisk = 25;
      velocityReason = 'Medium daily velocity';
    } else if (sessionsPerHour < 500) {
      velocityRisk = 50;
      velocityReason = 'High daily velocity';
    } else {
      velocityRisk = 80;
      velocityReason = `Extreme daily velocity (${Math.round(sessionsPerHour)}/hour)`;
    }
  } else {
    velocityRisk = 30;
    velocityReason = 'Daily stats unknown';
  }
  factors.push({ name: 'Daily Velocity', score: velocityRisk, reason: velocityReason });

  // FACTOR 8: Platform-Browser Mismatch (CRITICAL!)
  // WebKit on Linux = HUGE red flag (Safari only on macOS/iOS)
  // Firefox on Windows is suspicious (uncommon combo)
  let mismatchRisk = 0;
  let mismatchReason = '';
  
  if (browserInfo) {
    const { browserType, platform } = browserInfo;
    
    if (browserType === 'webkit' && platform === 'linux') {
      // CRITICAL: WebKit/Safari on Linux = definite bot signature
      mismatchRisk = 95; // Almost 100% suspicious
      mismatchReason = '🔴 CRITICAL: WebKit (Safari) on Linux = obvious bot (Safari only on macOS/iOS)';
    } else if (browserType === 'firefox' && platform === 'win32') {
      // Firefox on Windows is less common, slightly suspicious
      mismatchRisk = 35;
      mismatchReason = 'Firefox on Windows (less common combination)';
    } else if (browserType === 'chromium' && platform === 'linux') {
      // Chromium on Linux = normal, safe
      mismatchRisk = 10;
      mismatchReason = 'Chromium on Linux (normal combo)';
    } else if (browserType === 'chromium' && platform === 'win32') {
      // Chromium on Windows = normal, safe
      mismatchRisk = 10;
      mismatchReason = 'Chromium on Windows (normal combo)';
    } else if (browserType === 'webkit' && platform === 'darwin') {
      // WebKit on macOS = normal, safe
      mismatchRisk = 10;
      mismatchReason = 'WebKit (Safari) on macOS (normal combo)';
    } else {
      mismatchRisk = 30;
      mismatchReason = `Unusual combo: ${browserType} on ${platform}`;
    }
  } else {
    mismatchRisk = 20;
    mismatchReason = 'Browser info unknown';
  }
  factors.push({ name: 'Platform-Browser', score: mismatchRisk, reason: mismatchReason });

  // Calculate weighted risk score
  // Weights: more important factors get higher weight
  const weights: Record<string, number> = {
    'Bot Index': 0.22,          // First bots are most scrutinized
    'Proxy Age': 0.18,          // New proxies are flagged heavily
    'Platform-Browser': 0.18,   // NEW: Browser-OS mismatch (WebKit on Linux = 95% risky)
    'Bot Population': 0.13,     // Many bots = more detection risk
    'Daily Velocity': 0.13,     // Traffic velocity matters
    'Session Volume': 0.08,     // Individual session count
    'Pacing Mode': 0.08,        // Pacing affects detection
  };

  let weightedScore = 0;
  let totalWeight = 0;
  
  for (const factor of factors) {
    const weight = weights[factor.name] || 0.1;
    weightedScore += factor.score * weight;
    totalWeight += weight;
  }
  
  const riskScore = Math.round(weightedScore / totalWeight);

  // Determine if risky (threshold: 45/100)
  // Below 45: safe, can skip pre-warming
  // Above 45: risky, should do pre-warming
  // Special case: Platform-Browser mismatch risk > 80 = ALWAYS risky
  const platformBrowserFactor = factors.find(f => f.name === 'Platform-Browser');
  const isCriticalPlatformMismatch = platformBrowserFactor ? platformBrowserFactor.score > 80 : false;
  const isRisky = riskScore > 45 || isCriticalPlatformMismatch;

  // Generate recommendation
  let recommendation = '';
  if (isCriticalPlatformMismatch) {
    recommendation = '🔴 CRITICAL: WebKit on Linux detected! Use Chromium instead to avoid detection!';
  } else if (riskScore < 20) {
    recommendation = '✅ SAFE: Skip pre-warming (save proxy traffic)';
  } else if (riskScore < 40) {
    recommendation = '⚠️  LOW RISK: Optional pre-warming (consider skipping)';
  } else if (riskScore < 60) {
    recommendation = '⚡ MEDIUM RISK: Do pre-warming (moderate protection)';
  } else if (riskScore < 80) {
    recommendation = '🚨 HIGH RISK: Do pre-warming + extended delays';
  } else {
    recommendation = '🔴 CRITICAL: Full stealth + pre-warming + maybe skip this bot';
  }

  return {
    riskScore,
    isRisky,
    factors,
    recommendation,
  };
}

/**
 * Batch assessment for all bots in a run
 * Returns breakdown of how many bots need pre-warming
 */
export function assessRunRisk(config: AdsterraConfig): {
  averageRisk: number;
  riskBots: number;
  safeBots: number;
  estimatedPreWarmingCost: number; // in $
  recommendation: string;
} {
  const totalBots = config.totalBots || 100;
  const proxyTrafficCostPerGB = 0.004; // $ per GB
  const preWarmingDataGB = 0.01; // ~10MB per pre-warming
  const preWarmingCostPerBot = preWarmingDataGB * proxyTrafficCostPerGB;

  let riskBots = 0;
  let totalRisk = 0;

  for (let i = 0; i < Math.min(totalBots, 100); i++) {
    // Sample first 100 bots to estimate
    const assessment = assessBotRisk(i, config);
    totalRisk += assessment.riskScore;
    if (assessment.isRisky) {
      riskBots++;
    }
  }

  const averageRisk = Math.round(totalRisk / Math.min(totalBots, 100));
  const estimatedRiskBots = Math.round((riskBots / Math.min(totalBots, 100)) * totalBots);
  const safeBots = totalBots - estimatedRiskBots;
  const estimatedPreWarmingCost = estimatedRiskBots * preWarmingCostPerBot;

  let recommendation = '';
  if (averageRisk < 30) {
    recommendation = `✅ Low risk run. Estimated ${estimatedRiskBots} bots need pre-warming ($${estimatedPreWarmingCost.toFixed(3)}). Skip pre-warming for safe bots to save costs.`;
  } else if (averageRisk < 50) {
    recommendation = `⚡ Medium risk run. Pre-warm ~${estimatedRiskBots} bots ($${estimatedPreWarmingCost.toFixed(3)}). Consider using pre-warming cache.`;
  } else if (averageRisk < 70) {
    recommendation = `🚨 High risk run. Pre-warm ~${estimatedRiskBots} bots ($${estimatedPreWarmingCost.toFixed(3)}). Use cache and extend bot delays.`;
  } else {
    recommendation = `🔴 CRITICAL risk run. Pre-warm ALL bots ($${(totalBots * preWarmingCostPerBot).toFixed(3)}). Consider reducing bot count or increasing delays.`;
  }

  return {
    averageRisk,
    riskBots: estimatedRiskBots,
    safeBots,
    estimatedPreWarmingCost,
    recommendation,
  };
}
