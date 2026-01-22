/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mark Playwright and related packages as external (server-side only)
  experimental: {
    serverComponentsExternalPackages: [
      'playwright',
      'playwright-core',
      'chromium-bidi',
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude Playwright from bundling - it should only run on server
      config.externals = config.externals || [];
      config.externals.push({
        'playwright': 'commonjs playwright',
        'playwright-core': 'commonjs playwright-core',
        'chromium-bidi': 'commonjs chromium-bidi',
      });
    }
    return config;
  },
}

module.exports = nextConfig

