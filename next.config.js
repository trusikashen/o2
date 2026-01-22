/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark Playwright and related packages as external (server-side only)
  experimental: {
    serverComponentsExternalPackages: [
      'playwright',
      'playwright-core',
      'chromium-bidi',
      'ssh2', // Only for AWS backend, not for Netlify frontend
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude Playwright and ssh2 from bundling - they should only run on server
      config.externals = config.externals || [];
      config.externals.push({
        'playwright': 'commonjs playwright',
        'playwright-core': 'commonjs playwright-core',
        'chromium-bidi': 'commonjs chromium-bidi',
        'ssh2': 'commonjs ssh2',
      });
    } else {
      // For client build, completely ignore ssh2
      config.resolve.alias = config.resolve.alias || {};
      config.resolve.alias['ssh2'] = false;
    }
    return config;
  },
}

module.exports = nextConfig

