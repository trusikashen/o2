/**
 * Calculate optimal CONCURRENT_JOBS based on target impressions
 * 
 * Formula:
 * - Average session duration: ~60 seconds
 * - Sessions per hour per worker: 60 sessions/hour
 * - Target completion time: Tiered approach for optimal speed
 * - Workers needed: targetImpressions ÷ (sessions_per_hour × target_hours)
 * 
 * Fast targets (for 1× c6i.4xlarge always-on worker):
 * - ~$50/day (~21k impressions): ~3.5 hours
 * - ~$100/day (~42k impressions): ~3.5 hours
 * - ~$500/day (~211k impressions): ~10 hours
 * 
 * Constraints:
 * - Minimum: 2 (for small test runs)
 * - Maximum: 500 (configurable for large-scale operations)
 */

export function calculateOptimalConcurrency(
  targetImpressions: number,
  pacingMode?: 'fast' | 'human',
  pacingWindowHours?: number
): number {
  // Average session duration: ~60 seconds
  const SESSIONS_PER_HOUR_PER_WORKER = 60;
  
  // Determine target hours based on pacing mode
  let TARGET_HOURS: number;
  
  if (pacingMode === 'human' && pacingWindowHours) {
    // Human mode: Use the configured pacing window
    TARGET_HOURS = pacingWindowHours;
  } else if (pacingMode === 'fast') {
    // Fast mode: Complete as quickly as possible
    // - Under 60k impressions: ~3.5 hours
    // - 60k+ impressions: ~10 hours
    TARGET_HOURS = targetImpressions < 60000 ? 3.5 : 10;
  } else {
    // Default: Use fast mode logic (backward compatibility)
    TARGET_HOURS = targetImpressions < 60000 ? 3.5 : 10;
  }
  
  // Sessions per worker in target time
  const SESSIONS_PER_WORKER = SESSIONS_PER_HOUR_PER_WORKER * TARGET_HOURS;
  
  // Calculate workers needed
  // Formula: impressions ÷ (sessions_per_hour × target_hours)
  let workers = Math.ceil(targetImpressions / SESSIONS_PER_WORKER);
  
  // Apply constraints
  // For small test runs (< 1000 impressions), use moderate concurrency (5-10)
  // This prevents proxy overload while still being fast enough
  const MIN_CONCURRENCY = targetImpressions < 1000 ? 5 : 2; // 5 for test runs, 2 for very small
  const MAX_CONCURRENCY = 500; // Default max (can be increased via env var on worker)
  
  workers = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, workers));
  
  // For very small runs, cap at reasonable level to avoid proxy overload
  if (targetImpressions < 1000) {
    workers = Math.min(workers, 10); // Max 10 concurrent for test runs
  }
  
  return workers;
}

/**
 * Get recommended concurrency with explanation
 */
export function getConcurrencyRecommendation(
  targetImpressions: number,
  pacingMode?: 'fast' | 'human',
  pacingWindowHours?: number
): {
  concurrentJobs: number;
  estimatedHours: number;
  estimatedInstances: number;
  explanation: string;
} {
  const concurrentJobs = calculateOptimalConcurrency(targetImpressions, pacingMode, pacingWindowHours);
  const SESSIONS_PER_HOUR_PER_WORKER = 60;
  const estimatedHours = targetImpressions / (concurrentJobs * SESSIONS_PER_HOUR_PER_WORKER);
  
  // Calculate EC2 instances needed (t3.large = 70 jobs each)
  const JOBS_PER_INSTANCE = 70;
  const estimatedInstances = Math.max(1, Math.ceil(concurrentJobs / JOBS_PER_INSTANCE));
  
  const MAX_CONCURRENCY = 500;
  
  let explanation = '';
  if (concurrentJobs === 2) {
    explanation = 'Minimal concurrency for small test runs';
  } else if (concurrentJobs >= MAX_CONCURRENCY) {
    explanation = `Maximum concurrency (${MAX_CONCURRENCY}) reached - estimated ${estimatedHours.toFixed(1)}h completion`;
  } else if (pacingMode === 'human' && pacingWindowHours) {
    explanation = `Human pacing: ${concurrentJobs} concurrent browsers will complete ${targetImpressions.toLocaleString()} impressions across ${pacingWindowHours}h (estimated ${estimatedHours.toFixed(1)}h actual)`;
  } else if (pacingMode === 'fast') {
    explanation = `Fast mode: ${concurrentJobs} concurrent browsers will complete in ~${estimatedHours.toFixed(1)}h`;
  } else {
    explanation = `Estimated completion in ~${estimatedHours.toFixed(1)}h`;
  }
  
  return {
    concurrentJobs,
    estimatedHours,
    estimatedInstances,
    explanation,
  };
}

