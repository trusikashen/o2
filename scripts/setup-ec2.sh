#!/bin/bash
# Setup script for AWS EC2 instance
# Run this once on a fresh Ubuntu 22.04 EC2 instance

set -e

echo "=========================================="
echo "🚀 Setting up Adsterra Bot on EC2"
echo "=========================================="

# Update system
echo "📦 Updating system packages..."
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 20.x
echo "📦 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify Node.js installation
node --version
npm --version

# Install Playwright system dependencies
echo "📦 Installing Playwright system dependencies..."
sudo apt-get install -y \
  libnss3 \
  libnspr4 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libdbus-1-3 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpango-1.0-0 \
  libcairo2 \
  libatspi2.0-0 \
  libxshmfence1

# Install Git (if not already installed)
echo "📦 Installing Git..."
sudo apt-get install -y git

# Install PM2 for process management (optional but recommended)
echo "📦 Installing PM2..."
sudo npm install -g pm2

echo ""
echo "✅ System setup complete!"
echo ""
echo "Next steps:"
echo "1. Clone your repository:"
echo "   git clone https://github.com/yourusername/AdsenseLoading.git"
echo "   cd AdsenseLoading"
echo ""
echo "2. Install project dependencies:"
echo "   npm install"
echo "   cd adsterra && npm install"
echo ""
echo "3. Install Playwright browsers:"
echo "   npx playwright install chromium"
echo ""
echo "4. Create .env file in adsterra/ directory with your credentials"
echo ""
echo "5. Run the worker:"
echo "   cd adsterra"
echo "   npm run worker"
echo ""
echo "Or use PM2 to run in background:"
echo "   pm2 start npm --name adsterra-worker -- run worker"
echo "   pm2 logs adsterra-worker"
echo "   pm2 stop adsterra-worker"

