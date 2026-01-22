/**
 * Warm-up sites generator
 * Generates 3-5 realistic websites for pre-warming navigation
 * Uses TRUE randomization to avoid anti-fraud bot detection patterns
 */

const SITE_POOLS = {
  news: [
    'cnn.com',
    'bbc.com',
    'reuters.com',
    'theguardian.com',
    'nytimes.com',
    'washingtonpost.com',
    'forbes.com',
    'bloomberg.com',
    'apnews.com',
    'nbcnews.com',
    'abcnews.go.com',
    'cbsnews.com',
  ],
  social: [
    'reddit.com/r/pics',
    'reddit.com/r/funny',
    'reddit.com/r/worldnews',
    'twitter.com/explore',
    'instagram.com/explore',
    'pinterest.com/explore',
  ],
  tech: [
    'techcrunch.com',
    'theverge.com',
    'arstechnica.com',
    'wired.com',
    'engadget.com',
    'cnet.com',
    'zdnet.com',
    'pcmag.com',
  ],
  entertainment: [
    'youtube.com',
    'netflix.com',
    'imdb.com',
    'rottentomatoes.com',
    'twitch.tv',
    'spotify.com',
    'ign.com',
    'gamespot.com',
  ],
  shopping: [
    'amazon.com',
    'ebay.com',
    'walmart.com',
    'target.com',
    'bestbuy.com',
    'etsy.com',
    'aliexpress.com',
  ],
  lifestyle: [
    'buzzfeed.com',
    'huffpost.com',
    'vice.com',
    'healthline.com',
  ],
  sports: [
    'espn.com',
    'bleacherreport.com',
    'nfl.com',
    'nba.com',
  ],
  education: [
    'wikipedia.org',
    'stackoverflow.com',
    'github.com',
    'khanacademy.org',
  ],
};

/**
 * Generate 3-5 realistic warm-up sites for a device
 * Uses TRUE randomization (not seeded) to avoid anti-fraud detection
 * Each bot session gets different warm-up sites to avoid patterns
 * @param deviceId - Device identifier (for logging, not used for randomization)
 * @returns Array of 3-5 website URLs
 */
export function generateWarmUpSites(deviceId: string): string[] {
  // Use TRUE random (Math.random) instead of seeded random to avoid patterns
  // Each bot gets unique warm-up sequence to evade anti-fraud detection
  
  // Select 2-4 categories (most sessions have 2-3 categories)
  const categoryCount = 2 + Math.floor(Math.random() * 3);
  const allCategories = Object.keys(SITE_POOLS);
  const selectedCategories: string[] = [];

  // Randomly select categories without duplicates
  for (let i = 0; i < categoryCount; i++) {
    const idx = Math.floor(Math.random() * allCategories.length);
    const category = allCategories[idx];
    if (!selectedCategories.includes(category)) {
      selectedCategories.push(category);
    }
  }

  // From each category, select 1-2 sites
  const sites: string[] = [];
  for (const category of selectedCategories) {
    const pool = SITE_POOLS[category as keyof typeof SITE_POOLS];
    const count = 1 + Math.floor(Math.random() * 2);

    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const site = pool[idx];
      if (!sites.includes(site)) {
        sites.push(site);
      }
    }
  }

  // Shuffle sites using Fisher-Yates algorithm with TRUE randomization
  for (let i = sites.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [sites[i], sites[j]] = [sites[j], sites[i]];
  }

  // Return 3-5 sites (total across all categories)
  // Each call returns different sites due to true randomization
  return sites.slice(0, 3 + Math.floor(Math.random() * 3));
}
