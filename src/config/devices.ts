import type { BrowserContextOptions } from 'playwright';

export type BrowserType = 'chromium' | 'firefox' | 'webkit';
export type DeviceType = 'iphone' | 'android' | 'desktop' | 'tablet';

export interface DeviceConfig {
  viewport: { width: number; height: number };
  userAgent: string;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  browserType: BrowserType;
}

// Mobile Devices (Primary - matches mobile proxy)
const mobileDevices: Record<string, DeviceConfig> = {
  // iPhone devices (Safari on iOS)
  'iPhone 14 Pro': {
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    browserType: 'webkit', // Safari on iOS
  },
  'iPhone 13': {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    browserType: 'webkit',
  },
  'iPhone 12': {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    browserType: 'webkit',
  },
  
  // Android devices (Chrome on Android)
  'Samsung Galaxy S21': {
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium', // Chrome on Android
  },
  'Samsung Galaxy S20': {
    viewport: { width: 360, height: 800 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
  'Google Pixel 6': {
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
  'Google Pixel 5': {
    viewport: { width: 393, height: 851 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
  'OnePlus 9': {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 11; ONEPLUS A3003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
  
  // Additional Android devices (moved from Firefox)
  'Samsung Galaxy A53': {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
  'Xiaomi Redmi Note 11': {
    viewport: { width: 393, height: 873 },
    userAgent: 'Mozilla/5.0 (Linux; Android 12; 2201117TG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    deviceScaleFactor: 2.75,
    isMobile: true,
    hasTouch: true,
    browserType: 'chromium',
  },
};

// Tablet devices
const tabletDevices: Record<string, DeviceConfig> = {
  'iPad Pro 12.9': {
    viewport: { width: 1024, height: 1366 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    browserType: 'webkit', // Safari on iPad
  },
  'iPad Air': {
    viewport: { width: 820, height: 1180 },
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6.6 Mobile/15E148 Safari/604.1',
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: true,
    browserType: 'webkit',
  },
};

// Desktop devices (less common but adds diversity)
const desktopDevices: Record<string, DeviceConfig> = {
  'Windows Chrome': {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    browserType: 'chromium',
  },
  'Windows Edge': {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    browserType: 'chromium',  // Edge uses Chromium engine
  },
  'macOS Safari': {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    browserType: 'webkit',
  },
  'macOS Chrome': {
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    browserType: 'chromium',
  },
};

// Combine all devices
export const ALL_DEVICES: Record<string, DeviceConfig> = {
  ...mobileDevices,
  ...tabletDevices,
  ...desktopDevices,
};

// Device distribution weights (favor mobile for mobile proxy)
// NOTE: Firefox removed due to proxy compatibility issues with BrightData
export const DEVICE_WEIGHTS: Record<string, number> = {
  // Mobile devices: 70% (matches mobile proxy)
  'iPhone 14 Pro': 12,
  'iPhone 13': 10,
  'iPhone 12': 8,
  'Samsung Galaxy S21': 10,
  'Samsung Galaxy S20': 8,
  'Google Pixel 6': 8,
  'Google Pixel 5': 6,
  'OnePlus 9': 5,
  'Samsung Galaxy A53': 4,  // Replaced Firefox device
  'Xiaomi Redmi Note 11': 4,  // Replaced KaiOS device
  
  // Tablet: 15%
  'iPad Pro 12.9': 8,
  'iPad Air': 7,
  
  // Desktop: 15% (less common but adds diversity)
  'Windows Chrome': 5,
  'Windows Edge': 3,  // Replaced Windows Firefox (uses Chromium)
  'macOS Safari': 4,
  'macOS Chrome': 3,
};

/**
 * Get a random device based on weights (favors mobile devices)
 */
export function getRandomDevice(): { deviceName: string; config: DeviceConfig } {
  const devices = Object.keys(DEVICE_WEIGHTS);
  const weights = devices.map(d => DEVICE_WEIGHTS[d]);
  
  // Calculate cumulative weights
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < devices.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      const deviceName = devices[i];
      return {
        deviceName,
        config: ALL_DEVICES[deviceName],
      };
    }
  }
  
  // Fallback to first device
  const deviceName = devices[0];
  return {
    deviceName,
    config: ALL_DEVICES[deviceName],
  };
}

/**
 * Get Playwright browser type from device config
 */
export function getBrowserType(deviceConfig: DeviceConfig): BrowserType {
  return deviceConfig.browserType;
}

/**
 * Get browser context options for a device
 */
export function getContextOptionsForDevice(
  deviceConfig: DeviceConfig,
  country: 'US' | 'UK' | 'FR' = 'US',
  timezone?: string
): BrowserContextOptions {
  // Map country to timezone and locale
  const countryMap: Record<string, { timezone: string; locale: string }> = {
    'US': { timezone: 'America/New_York', locale: 'en-US' },
    'UK': { timezone: 'Europe/London', locale: 'en-GB' },
    'FR': { timezone: 'Europe/Paris', locale: 'fr-FR' },
  };
  
  const countryConfig = countryMap[country] || countryMap['US'];
  const defaultTimezone = timezone || countryConfig.timezone;
  const locale = countryConfig.locale;
  
  // Firefox does not support isMobile flag in Playwright
  const isMobile = deviceConfig.browserType === 'firefox' ? undefined : deviceConfig.isMobile;
  const hasTouch = deviceConfig.browserType === 'firefox' ? undefined : deviceConfig.hasTouch;
  
  return {
    viewport: deviceConfig.viewport,
    userAgent: deviceConfig.userAgent,
    deviceScaleFactor: deviceConfig.deviceScaleFactor,
    isMobile: isMobile,
    hasTouch: hasTouch,
    locale,
    timezoneId: defaultTimezone,
    permissions: ['geolocation'],
    colorScheme: 'light',
    ignoreHTTPSErrors: true,
  };
}

