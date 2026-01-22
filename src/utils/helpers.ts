export function random(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Add random jitter to a timing value to prevent anti-fraud detection
 * Adds 0.1 to 4.9 seconds (100-4900ms) to make timings unpredictable
 * Example: 120000ms becomes 120100-124900ms
 * @param ms Base timing in milliseconds
 * @returns Timing with jitter added
 */
export function addJitter(ms: number): number {
  const jitterMs = random(100, 4900); // 0.1 to 4.9 seconds
  return ms + jitterMs;
}

/**
 * Add random jitter to a timing range to prevent anti-fraud detection
 * Each value gets independent random jitter (0.1-4.9 seconds)
 * Example: random(120000, 150000) becomes something like random(120100-124900, 150100-154900)
 * @param min Minimum timing in milliseconds
 * @param max Maximum timing in milliseconds
 * @returns Random value within range with jitter added to both bounds
 */
export function randomWithJitter(min: number, max: number): number {
  return addJitter(random(min, max));
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

