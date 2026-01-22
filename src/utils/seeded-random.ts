/**
 * Deterministic random number generator based on a seed
 * Ensures reproducible randomness per device while maintaining entropy
 * 
 * Usage:
 *   const rng = seededRandom('device-123');
 *   const randomValue = rng(); // Returns 0-1
 */

export function seededRandom(seed: string): () => number {
  let hash = 0;
  
  // Convert seed string to initial hash value
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Return function that generates pseudo-random numbers
  return function () {
    // Linear congruential generator (simple but effective)
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
}
