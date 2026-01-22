/**
 * Frontend distribution calculator
 * Replicates the backend calculateDistributionMatrix logic
 * to show exact distribution in the UI
 */

export interface DistributionConfig {
  countries: Record<string, number>;
  devices: Record<string, number>;
  browsers: Record<string, number>;
}

export interface DistributionMatrixEntry {
  country: string;
  deviceType: 'mobile' | 'tablet' | 'desktop';
  deviceName: string;
  browserType: 'webkit' | 'chromium' | 'firefox';
  count: number;
}

export interface DistributionMatrix {
  total: number;
  entries: DistributionMatrixEntry[];
}

// Device-browser mapping (simplified for frontend)
const DEVICE_BROWSER_MAP: Record<string, ('webkit' | 'chromium' | 'firefox')[]> = {
  mobile: ['webkit', 'chromium', 'firefox'],
  tablet: ['webkit', 'chromium', 'firefox'],
  desktop: ['chromium', 'firefox', 'webkit'],
};

// Device selection matching backend logic
// Devices are filtered by browser type, so we need to map browser to specific devices
export const DEVICE_SELECTION: Record<string, Record<string, string[]>> = {
  mobile: {
    webkit: ['iPhone 14 Pro', 'iPhone 13', 'iPhone 12'], // iOS Safari
    chromium: ['Samsung Galaxy S21', 'Samsung Galaxy S20', 'Google Pixel 6', 'Google Pixel 5', 'OnePlus 9'], // Android Chrome
    firefox: ['Samsung Galaxy S21 Firefox', 'KaiOS Device'], // Android Firefox + KaiOS
  },
  tablet: {
    webkit: ['iPad Pro 12.9', 'iPad Air'], // iPad Safari
    chromium: ['Samsung Galaxy S21', 'Samsung Galaxy S20'], // Android Tablet Chrome (reusing mobile devices)
    firefox: ['Samsung Galaxy S21 Firefox'], // Android Tablet Firefox
  },
  desktop: {
    chromium: ['Windows Chrome', 'macOS Chrome'], // Chrome
    firefox: ['Windows Firefox'], // Firefox
    webkit: ['macOS Safari'], // Safari
  },
};

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

      // Filter browsers based on config
      const validBrowsers = availableBrowsers.filter(b =>
        (b === 'webkit' && 'safari' in config.browsers) ||
        (b === 'chromium' && 'chrome' in config.browsers) ||
        (b === 'firefox' && 'firefox' in config.browsers)
      );

      if (validBrowsers.length === 0) continue;

      // Calculate browser distribution for this device
      let remainingDeviceImpressions = deviceImpressions;
      const browserCounts: Record<string, number> = {};

      // Calculate total browser percentage for available browsers
      const totalBrowserPercent = validBrowsers.reduce((sum, b) => {
        const key = b === 'webkit' ? 'safari' : b === 'chromium' ? 'chrome' : 'firefox';
        return sum + (config.browsers[key] || 0);
      }, 0);

      // Distribute impressions across browsers
      for (let i = 0; i < validBrowsers.length; i++) {
        const browser = validBrowsers[i];
        const browserKey = browser === 'webkit' ? 'safari' : browser === 'chromium' ? 'chrome' : 'firefox';
        const browserPercent = config.browsers[browserKey] || 0;

        if (i === validBrowsers.length - 1) {
          // Last browser gets remaining impressions
          browserCounts[browser] = remainingDeviceImpressions;
        } else {
          // Normalize percentage to available browsers only
          const normalizedPercent = totalBrowserPercent > 0 ? browserPercent / totalBrowserPercent : 1 / validBrowsers.length;
          const count = Math.round(deviceImpressions * normalizedPercent);
          browserCounts[browser] = count;
          remainingDeviceImpressions -= count;
        }
      }

      // For each browser, create entries
      for (const [browser, browserCount] of Object.entries(browserCounts)) {
        if (browserCount <= 0) continue;

        const browserType = browser as 'webkit' | 'chromium' | 'firefox';
        const availableDevices = DEVICE_SELECTION[deviceType]?.[browserType] || [];

        if (availableDevices.length === 0) continue;

        // Distribute impressions across matching devices
        const impressionsPerDevice = Math.floor(browserCount / availableDevices.length);
        const remainder = browserCount % availableDevices.length;

        for (let i = 0; i < availableDevices.length; i++) {
          const deviceName = availableDevices[i];
          const count = impressionsPerDevice + (i < remainder ? 1 : 0);

          if (count > 0) {
            entries.push({
              country,
              deviceType: deviceType as 'mobile' | 'tablet' | 'desktop',
              deviceName,
              browserType,
              count,
            });
          }
        }
      }
    }
  }

  // Verify total and adjust for rounding
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

