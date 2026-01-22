/**
 * Referrer generator
 * Generates realistic HTTP referrer URLs
 * Weighted distribution: 65% search engines, 25% social, 10% direct
 */

import { seededRandom } from './seeded-random';

interface ReferrerOption {
  url: string;
  weight: number;
  searchQuery?: boolean;
}

const REFERRER_POOL: ReferrerOption[] = [
  // Search engines (65% total)
  { url: 'https://www.google.com/search?q=', weight: 20, searchQuery: true },
  { url: 'https://www.bing.com/search?q=', weight: 5, searchQuery: true },
  { url: 'https://duckduckgo.com/?q=', weight: 5, searchQuery: true },
  { url: 'https://news.google.com/', weight: 10 },
  { url: 'https://www.google.com/', weight: 15 },

  // Social media (25% total)
  { url: 'https://www.facebook.com/', weight: 15 },
  { url: 'https://m.facebook.com/', weight: 8 },
  { url: 'https://twitter.com/home', weight: 10 },
  { url: 'https://www.instagram.com/', weight: 7 },
  { url: 'https://www.youtube.com/', weight: 10 },
  { url: 'https://www.reddit.com/', weight: 5 },

  // Direct/no referrer (10% total)
  { url: '', weight: 5 },
];

const SEARCH_QUERIES = [
  'best apps 2025',
  'free games',
  'how to download',
  'android apps',
  'mobile games',
  'productivity apps',
  'photo editor',
  'video player',
  'music streaming',
  'vpn free',
  'browser fast',
  'antivirus mobile',
  'battery saver',
  'file manager',
  'cleaner app',
  'download manager',
  'screen recorder',
  'video downloader',
  'image converter',
  'pdf reader',
];

/**
 * Generate a realistic referrer URL
 * @param deviceId - Device identifier (ensures deterministic selection per device)
 * @returns Referrer URL string (empty string for "direct" traffic)
 */
export function generateReferrer(deviceId: string): string {
  const rng = seededRandom(deviceId + Date.now().toString());

  // Calculate total weight
  const totalWeight = REFERRER_POOL.reduce((sum, r) => sum + r.weight, 0);

  // Select referrer based on weighted distribution
  let random = rng() * totalWeight;
  let selected: ReferrerOption | null = null;

  for (const ref of REFERRER_POOL) {
    random -= ref.weight;
    if (random <= 0) {
      selected = ref;
      break;
    }
  }

  // Fallback to first option if none selected
  if (!selected) {
    selected = REFERRER_POOL[0];
  }

  // If search engine, append random query
  if (selected.searchQuery && selected.url) {
    const query = SEARCH_QUERIES[Math.floor(rng() * SEARCH_QUERIES.length)];
    return selected.url + encodeURIComponent(query);
  }

  return selected.url;
}
