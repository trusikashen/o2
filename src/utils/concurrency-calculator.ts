/**
 * Calculate optimal CONCURRENT_JOBS based on target impressions
 * 
 * Formula:
 * - Average session duration: ~60 seconds
 * - Sessions per hour per worker: 60 sessions/hour
 * - Target completion time: Configurable (default 24 hours for large runs, 4 hours for small)
 * - Workers needed: targetImpressions ÷ (sessions_per_hour × target_hours)
 * 
 * Constraints:
 * - Minimum: 2 (for small runs)
 * - Maximum: Configurable via MAX_CONCURRENT_JOBS env var (default: 500)
 *   - Can be increased based on instance RAM/CPU capacity
 *   - Each browser session uses ~50-100 MB RAM
 *   - Example: 500 concurrent = ~25-50 GB RAM needed
 */

export function calculateOptimalConcurrency(
  targetImpressions: number,
  targetHours?: number
): number {
  // Average session duration: ~60 seconds
  const SESSIONS_PER_HOUR_PER_WORKER = 60;
  
  // Fast targets (for 1× c6i.4xlarge always-on worker):
  // - Under 60k impressions: ~3.5 hours
  // - 60k+ impressions: ~10 hours
  let TARGET_HOURS = targetHours;
  if (!TARGET_HOURS) {
    TARGET_HOURS = targetImpressions < 60000 ? 3.5 : 10;
  }
  
  // Sessions per worker in target time
  const SESSIONS_PER_WORKER = SESSIONS_PER_HOUR_PER_WORKER * TARGET_HOURS;
  
  // Calculate workers needed
  let workers = Math.ceil(targetImpressions / SESSIONS_PER_WORKER);
  
  // Apply constraints
  const MIN_CONCURRENCY = 2; // Minimum for small runs
  const MAX_CONCURRENCY = parseInt(
    process.env.MAX_CONCURRENT_JOBS || '500',
    10
  ); // Configurable max (default 500 for $500/day in 24h)
  
  workers = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, workers));
  
  return workers;
}

/**
 * Get recommended concurrency with explanation
 */
export function getConcurrencyRecommendation(targetImpressions: number): {
  concurrentJobs: number;
  estimatedHours: number;
  explanation: string;
} {
  const concurrentJobs = calculateOptimalConcurrency(targetImpressions);
  const SESSIONS_PER_HOUR_PER_WORKER = 60;
  const estimatedHours = targetImpressions / (concurrentJobs * SESSIONS_PER_HOUR_PER_WORKER);
  
  const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENT_JOBS || '500', 10);
  const targetHours = targetImpressions < 60000 ? 3.5 : 10;
  
  let explanation = '';
  if (concurrentJobs === 2) {
    explanation = 'Minimal concurrency for small test runs';
  } else if (concurrentJobs >= MAX_CONCURRENCY) {
    explanation = `Maximum concurrency (${MAX_CONCURRENCY}) reached - estimated ${estimatedHours.toFixed(1)}h completion`;
  } else if (targetImpressions >= 60000) {
    explanation = `Optimized for ~${estimatedHours.toFixed(1)} hour completion (target: ~10h for large runs)`;
  } else {
    explanation = `Optimized for ~${estimatedHours.toFixed(1)} hour completion (target: ~3.5h for small runs)`;
  }
  
  return {
    concurrentJobs,
    estimatedHours,
    explanation,
  };
}

