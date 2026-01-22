/**
 * Rate limiter for BrightData proxy
 * NOTE: Rate limit has been removed after adding funds to BrightData account
 * This limiter is kept for safety but set to a very high limit (effectively disabled)
 */

class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    
    // Remove requests outside the time window
    this.requests = this.requests.filter(timestamp => now - timestamp < this.windowMs);
    
    // If we're at the limit, wait until the oldest request expires
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.windowMs - (now - oldestRequest) + 100; // Add 100ms buffer
      if (waitTime > 0) {
        console.log(`   ⏳ Rate limit: waiting ${Math.ceil(waitTime)}ms (${this.requests.length}/${this.maxRequests} requests in window)`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        // Clean up again after waiting
        const newNow = Date.now();
        this.requests = this.requests.filter(timestamp => newNow - timestamp < this.windowMs);
      }
    }
    
    // Record this request
    this.requests.push(Date.now());
  }
}

// BrightData rate limit: REMOVED (funds added, no rate limit)
// Set to a very high number (100,000 req/min) to effectively disable rate limiting
// This allows maximum throughput without restrictions
export const brightDataRateLimiter = new RateLimiter(100000, 60 * 1000);

