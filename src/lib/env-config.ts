// Define environment variable schemas
export interface EnvVariable {
  key: string;
  value: string;
  type: 'text' | 'password' | 'number' | 'boolean' | 'select';
  label: string;
  description?: string;
  required?: boolean;
  options?: { value: string; label: string }[];
}

export const ENV_CONFIG: EnvVariable[] = [
  // Proxy Configuration
  {
    key: 'PROXY_PROVIDER',
    type: 'select',
    label: 'Proxy Provider',
    description: 'Select your proxy service provider',
    options: [
      { value: 'brightdata', label: 'BrightData' },
      { value: 'dataimpulse', label: 'DataImpulse' },
      { value: 'iproyal', label: 'IPRoyal' },
    ],
  },
  {
    key: 'BRIGHTDATA_HOST',
    type: 'text',
    label: 'BrightData Host',
    description: 'BrightData proxy host',
  },
  {
    key: 'BRIGHTDATA_PORT',
    type: 'text',
    label: 'BrightData Port',
    description: 'BrightData proxy port',
  },
  {
    key: 'BRIGHTDATA_USERNAME',
    type: 'text',
    label: 'BrightData Username',
    description: 'BrightData account username',
  },
  {
    key: 'BRIGHTDATA_PASSWORD',
    type: 'password',
    label: 'BrightData Password',
    description: 'BrightData account password',
  },
  {
    key: 'BRIGHTDATA_ZONE',
    type: 'text',
    label: 'BrightData Zone',
    description: 'BrightData zone name',
  },

  // AWS Configuration
  {
    key: 'AWS_REGION',
    type: 'select',
    label: 'AWS Region',
    description: 'AWS region for DynamoDB',
    options: [
      { value: 'us-east-1', label: 'US East (N. Virginia)' },
      { value: 'us-west-2', label: 'US West (Oregon)' },
      { value: 'eu-west-1', label: 'EU (Ireland)' },
      { value: 'eu-central-1', label: 'EU (Frankfurt)' },
    ],
  },
  {
    key: 'AWS_ACCESS_KEY_ID',
    type: 'password',
    label: 'AWS Access Key ID',
    description: 'AWS access key for authentication',
  },
  {
    key: 'AWS_SECRET_ACCESS_KEY',
    type: 'password',
    label: 'AWS Secret Access Key',
    description: 'AWS secret access key',
  },

  // DynamoDB Tables
  {
    key: 'DYNAMODB_ADSTERRA_RUNS_TABLE',
    type: 'text',
    label: 'DynamoDB Runs Table',
    description: 'Table name for Adsterra runs',
  },
  {
    key: 'DYNAMODB_ADSTERRA_JOBS_TABLE',
    type: 'text',
    label: 'DynamoDB Jobs Table',
    description: 'Table name for Adsterra jobs',
  },

  // Browser Configuration
  {
    key: 'BROWSER_HEADLESS',
    type: 'boolean',
    label: 'Browser Headless Mode',
    description: 'Run browser in headless mode (no GUI)',
  },
  {
    key: 'BROWSER_TIMEOUT',
    type: 'number',
    label: 'Browser Timeout (ms)',
    description: 'Browser operation timeout in milliseconds',
  },

  // Worker Configuration
  {
    key: 'MAX_WORKER_THREADS',
    type: 'number',
    label: 'Max Worker Threads',
    description: 'Maximum number of concurrent worker threads',
  },

  // Queue Configuration
  {
    key: 'QUEUE_POLL_INTERVAL',
    type: 'number',
    label: 'Queue Poll Interval (ms)',
    description: 'Interval to poll job queue',
  },
  {
    key: 'MAX_RETRIES',
    type: 'number',
    label: 'Max Retries',
    description: 'Maximum number of job retries',
  },

  // Timing Configuration
  {
    key: 'NAV_RETRIES',
    type: 'number',
    label: 'Navigation Retries',
    description: 'Number of navigation retry attempts',
  },
  {
    key: 'NAV_BACKOFF_MS',
    type: 'number',
    label: 'Navigation Backoff (ms)',
    description: 'Backoff time between navigation retries',
  },
  {
    key: 'MIN_SCROLL_WAIT',
    type: 'number',
    label: 'Min Scroll Wait (ms)',
    description: 'Minimum scroll wait time',
  },
  {
    key: 'MAX_SCROLL_WAIT',
    type: 'number',
    label: 'Max Scroll Wait (ms)',
    description: 'Maximum scroll wait time',
  },
  {
    key: 'MIN_AD_WAIT',
    type: 'number',
    label: 'Min Ad Wait (ms)',
    description: 'Minimum ad page wait time',
  },
  {
    key: 'MAX_AD_WAIT',
    type: 'number',
    label: 'Max Ad Wait (ms)',
    description: 'Maximum ad page wait time',
  },

  // Bot Configuration
  {
    key: 'TOTAL_BOTS',
    type: 'number',
    label: 'Total Bots',
    description: 'Total number of bots',
  },
  {
    key: 'SESSIONS_PER_BOT',
    type: 'number',
    label: 'Sessions Per Bot',
    description: 'Number of sessions per bot',
  },
  {
    key: 'TARGET_IMPRESSIONS',
    type: 'number',
    label: 'Target Impressions',
    description: 'Target number of impressions',
  },
];

// Group variables by category
export function groupEnvConfig(): Record<string, EnvVariable[]> {
  const groups: Record<string, EnvVariable[]> = {
    'Proxy Settings': [],
    'AWS Configuration': [],
    'Database': [],
    'Browser': [],
    'Worker': [],
    'Queue': [],
    'Timing': [],
    'Bot': [],
  };

  ENV_CONFIG.forEach(variable => {
    if (variable.key.startsWith('PROXY') || variable.key.startsWith('BRIGHTDATA') || variable.key.startsWith('DATAIMPULSE') || variable.key.startsWith('IPROYAL')) {
      groups['Proxy Settings'].push(variable);
    } else if (variable.key.startsWith('AWS')) {
      groups['AWS Configuration'].push(variable);
    } else if (variable.key.startsWith('DYNAMODB')) {
      groups['Database'].push(variable);
    } else if (variable.key.startsWith('BROWSER')) {
      groups['Browser'].push(variable);
    } else if (variable.key.startsWith('MAX_WORKER') || variable.key === 'WORKER_THREADS') {
      groups['Worker'].push(variable);
    } else if (variable.key.startsWith('QUEUE') || variable.key.startsWith('MAX_RETRIES')) {
      groups['Queue'].push(variable);
    } else if (variable.key.startsWith('MIN_') || variable.key.startsWith('MAX_') || variable.key.startsWith('NAV_')) {
      groups['Timing'].push(variable);
    } else {
      groups['Bot'].push(variable);
    }
  });

  return groups;
}
