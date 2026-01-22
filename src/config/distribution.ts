// @ts-nocheck
import { ALL_DEVICES, type BrowserType, type DeviceConfig } from './devices';

/**
 * Distribution Configuration
 * Defines how impressions are split across countries, devices, and browsers
 */
export interface DistributionConfig {
  countries: Record<string, number>; // e.g., { us: 40, uk: 15, ... } (percentages)
  devices: Record<string, number>; // e.g., { mobile: 80, tablet: 15, desktop: 5 } (percentages)
  browsers: Record<string, number>; // e.g., { safari: 50, firefox: 35, chrome: 15 } (percentages)
}

/**
 * Default Distribution Configuration
 * Based on user requirements:
 * - Mobile: 80% (primary)
 * - Tablet: 15%
 * - Desktop: 5% (minimal - automation red flag)
 * - Safari: 60% (primary - iOS devices)
 * - Chrome: 40% (Android and desktop)
 * 
 * NOTE: Firefox removed due to proxy compatibility issues with BrightData
 */
export const DEFAULT_DISTRIBUTION: DistributionConfig = {
  countries: {
    us: 50,   // USA
    uk: 17,   // United Kingdom
    fr: 11,   // France
    es: 9,    // Spain
    ie: 8,    // Ireland
    au: 5,    // Australia
  },
  devices: {
    mobile: 80,
    tablet: 15,
    desktop: 5,
  },
  browsers: {
    safari: 60,  // iOS Safari (WebKit)
    chrome: 40,  // Android Chrome + Desktop Chrome/Edge (Chromium)
  },
};

/**
 * Device to Browser Mapping
 * Defines which browsers are available for each device type
 * NOTE: Firefox removed due to proxy compatibility issues
 */
const DEVICE_BROWSER_MAP: Record<string, BrowserType[]> = {
  mobile: ['webkit', 'chromium'], // iOS Safari, Android Chrome
  tablet: ['webkit', 'chromium'], // iPad Safari, Android Tablet Chrome
  desktop: ['chromium', 'webkit'], // Windows/Mac Chrome/Edge, macOS Safari
};

/**
 * Device Selection by Type
 * Maps device type to specific device names
 * NOTE: Firefox devices removed due to proxy compatibility issues
 */
const DEVICE_SELECTION: Record<string, string[]> = {
  mobile: [
    // iOS devices (Safari)
    'iPhone 14 Pro',
    'iPhone 13',
    'iPhone 12',
    // Android devices (Chrome)
    'Samsung Galaxy S21',
    'Samsung Galaxy S20',
    'Google Pixel 6',
    'Google Pixel 5',
    'OnePlus 9',
    'Samsung Galaxy A53',  // Replaced Firefox device
    'Xiaomi Redmi Note 11',  // Replaced KaiOS device
  ],
  tablet: [
    'iPad Pro 12.9',
    'iPad Air',
  ],
  desktop: [
    'Windows Chrome',
    'Windows Edge',  // Replaced Windows Firefox (uses Chromium)
    'macOS Safari',
    'macOS Chrome',
  ],
};

/**
 * Country Code to Full Name Mapping
 */
export const COUNTRY_NAMES: Record<string, string> = {
  us: 'United States',
  uk: 'United Kingdom',
  fr: 'France',
  es: 'Spain',
  ie: 'Ireland',
  au: 'Australia',
};

/**
 * Distribution Matrix Entry
 * Represents exact count for a specific combination
 */
export interface DistributionMatrixEntry {
  country: string;
  deviceType: string; // 'mobile', 'tablet', 'desktop'
  deviceName: string; // Specific device name
  browserType: BrowserType;
  count: number; // Exact number of impressions
}

/**
 * Distribution Matrix
 * Complete breakdown of all combinations with exact counts
 */
export interface DistributionMatrix {
  entries: DistributionMatrixEntry[];
  total: number;
}

/**
 * Calculate distribution matrix from config and total impressions
 */
export function calculateDistributionMatrix(
  config: DistributionConfig,
  totalImpressions: number
): DistributionMatrix {
  const entries: DistributionMatrixEntry[] = [];
  
  // Validate percentages sum to 100
  const countrySum = Object.values(config.countries).reduce((a, b) => a + b, 0);
  const deviceSum = Object.values(config.devices).reduce((a, b) => a + b, 0);
  const browserSum = Object.values(config.browsers).reduce((a, b) => a + b, 0);
  
  if (Math.abs(countrySum - 100) > 0.01) {
    throw new Error(`Country percentages must sum to 100, got ${countrySum}`);
  }
  if (Math.abs(deviceSum - 100) > 0.01) {
    throw new Error(`Device percentages must sum to 100, got ${deviceSum}`);
  }
  if (Math.abs(browserSum - 100) > 0.01) {
    throw new Error(`Browser percentages must sum to 100, got ${browserSum}`);
  }
  
  // Calculate distribution for each country
  for (const [country, countryPercent] of Object.entries(config.countries)) {
    const countryImpressions = Math.round(totalImpressions * (countryPercent / 100));
    
    // For each device type
    for (const [deviceType, devicePercent] of Object.entries(config.devices)) {
      const deviceImpressions = Math.round(countryImpressions * (devicePercent / 100));
      
      // Get available browsers for this device type
      const availableBrowsers = DEVICE_BROWSER_MAP[deviceType] || [];
      
      // Filter browsers based on config (only include browsers that are in config)
      const configBrowsers = Object.keys(config.browsers) as BrowserType[];
      const validBrowsers = availableBrowsers.filter(b => 
        (b === 'webkit' && configBrowsers.includes('safari')) ||
        (b === 'chromium' && configBrowsers.includes('chrome')) ||
        (b === 'firefox' && configBrowsers.includes('firefox'))
      );
      
      if (validBrowsers.length === 0) continue;
      
      // Calculate browser distribution for this device
      let remainingDeviceImpressions = deviceImpressions;
      const browserCounts: Record<BrowserType, number> = {} as any;
      
      // Calculate total browser percentage for available browsers
      const totalBrowserPercent = validBrowsers.reduce((sum, b) => {
        const key = b === 'webkit' ? 'safari' : b === 'chromium' ? 'chrome' : 'firefox';
        return sum + (config.browsers[key] || 0);
      }, 0);
      
      // Distribute impressions across browsers (normalize percentages to available browsers)
      for (let i = 0; i < validBrowsers.length; i++) {
        const browser = validBrowsers[i];
        const browserKey = browser === 'webkit' ? 'safari' : browser === 'chromium' ? 'chrome' : 'firefox';
        const browserPercent = config.browsers[browserKey] || 0;
        
        if (i === validBrowsers.length - 1) {
          // Last browser gets remaining impressions to avoid rounding errors
          browserCounts[browser] = remainingDeviceImpressions;
        } else {
          // Normalize percentage to available browsers only
          const normalizedPercent = totalBrowserPercent > 0 ? browserPercent / totalBrowserPercent : 1 / validBrowsers.length;
          const count = Math.round(deviceImpressions * normalizedPercent);
          browserCounts[browser] = count;
          remainingDeviceImpressions -= count;
        }
      }
      
      // For each browser, select devices and create entries
      for (const [browser, browserCount] of Object.entries(browserCounts)) {
        if (browserCount <= 0) continue;
        
        const browserType = browser as BrowserType;
        const availableDevices = DEVICE_SELECTION[deviceType] || [];
        
        // Filter devices by browser type
        const matchingDevices = availableDevices.filter(deviceName => {
          const device = ALL_DEVICES[deviceName];
          return device && device.browserType === browserType;
        });
        
        if (matchingDevices.length === 0) continue;
        
        // Distribute impressions across matching devices
        const impressionsPerDevice = Math.floor(browserCount / matchingDevices.length);
        const remainder = browserCount % matchingDevices.length;
        
        for (let i = 0; i < matchingDevices.length; i++) {
          const deviceName = matchingDevices[i];
          const count = impressionsPerDevice + (i < remainder ? 1 : 0);
          
          if (count > 0) {
            entries.push({
              country,
              deviceType,
              deviceName,
              browserType,
              count,
            });
          }
        }
      }
    }
  }
  
  // Verify total
  const calculatedTotal = entries.reduce((sum, e) => sum + e.count, 0);
  const difference = totalImpressions - calculatedTotal;
  
  // Distribute any rounding difference to largest entries
  if (difference !== 0) {
    const sortedEntries = [...entries].sort((a, b) => b.count - a.count);
    for (let i = 0; i < Math.abs(difference); i++) {
      const entry = sortedEntries[i % sortedEntries.length];
      if (difference > 0) {
        entry.count++;
      } else if (entry.count > 0) {
        entry.count--;
      }
    }
  }
  
  return {
    entries,
    total: entries.reduce((sum, e) => sum + e.count, 0),
  };
}

/**
 * Get a combination from distribution matrix by index
 * Used to assign specific combinations to jobs
 */
export function getCombinationFromMatrix(
  matrix: DistributionMatrix,
  index: number
): DistributionMatrixEntry | null {
  let currentIndex = 0;
  
  for (const entry of matrix.entries) {
    if (index >= currentIndex && index < currentIndex + entry.count) {
      return entry;
    }
    currentIndex += entry.count;
  }
  
  return null;
}

/**
 * Validate distribution config
 */
export function validateDistributionConfig(config: DistributionConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const countrySum = Object.values(config.countries).reduce((a, b) => a + b, 0);
  const deviceSum = Object.values(config.devices).reduce((a, b) => a + b, 0);
  const browserSum = Object.values(config.browsers).reduce((a, b) => a + b, 0);
  
  if (Math.abs(countrySum - 100) > 0.01) {
    errors.push(`Country percentages must sum to 100, got ${countrySum}`);
  }
  if (Math.abs(deviceSum - 100) > 0.01) {
    errors.push(`Device percentages must sum to 100, got ${deviceSum}`);
  }
  if (Math.abs(browserSum - 100) > 0.01) {
    errors.push(`Browser percentages must sum to 100, got ${browserSum}`);
  }
  
  // Check for negative values
  for (const [key, value] of Object.entries(config.countries)) {
    if (value < 0) errors.push(`Country ${key} has negative percentage: ${value}`);
  }
  for (const [key, value] of Object.entries(config.devices)) {
    if (value < 0) errors.push(`Device ${key} has negative percentage: ${value}`);
  }
  for (const [key, value] of Object.entries(config.browsers)) {
    if (value < 0) errors.push(`Browser ${key} has negative percentage: ${value}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}


