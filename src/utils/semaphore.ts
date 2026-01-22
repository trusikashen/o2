/**
 * Simple semaphore implementation for limiting concurrent operations
 */
export class Semaphore {
  private count: number;
  private waiters: Array<() => void> = [];

  constructor(initialCount: number) {
    this.count = initialCount;
  }

  /**
   * Acquire a permit (wait if none available)
   */
  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }

    // Wait for a permit to become available
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    this.count++;
    if (this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) {
        this.count--;
        next();
      }
    }
  }

  /**
   * Update the maximum number of permits
   */
  setMaxPermits(maxPermits: number): void {
    const oldCount = this.count;
    const totalPermits = oldCount + (this.waiters.length);
    
    // Adjust count to new max
    this.count = Math.min(maxPermits, oldCount + Math.max(0, maxPermits - totalPermits));
    
    // Release waiting permits up to new max
    while (this.count > 0 && this.waiters.length > 0) {
      const next = this.waiters.shift();
      if (next) {
        this.count--;
        next();
      }
    }
  }

  /**
   * Get current available permits
   */
  getAvailable(): number {
    return this.count;
  }

  /**
   * Get current max permits (approximate)
   */
  getMaxPermits(): number {
    return this.count + this.waiters.length;
  }
}

