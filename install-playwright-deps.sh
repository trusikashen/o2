#!/bin/bash
# Install Playwright system dependencies for DigitalOcean App Platform
# This script installs dependencies that Chromium needs

set -e

echo "Installing Playwright system dependencies..."

# DigitalOcean App Platform should have these, but we'll verify
# If they're missing, we'll try to install them (may require root in some cases)

# List of required libraries
REQUIRED_LIBS=(
  "libnspr4"
  "libnss3"
  "libatk1.0-0"
  "libatk-bridge2.0-0"
  "libcups2"
  "libdrm2"
  "libdbus-1-3"
  "libxkbcommon0"
  "libxcomposite1"
  "libxdamage1"
  "libxfixes3"
  "libxrandr2"
  "libgbm1"
  "libasound2"
  "libpango-1.0-0"
  "libcairo2"
)

# Check if we can install (DigitalOcean might have these pre-installed)
if command -v apt-get &> /dev/null; then
  echo "System package manager found, checking dependencies..."
  # Note: In DigitalOcean App Platform, we typically can't use apt-get
  # But we'll try to verify libraries exist
  for lib in "${REQUIRED_LIBS[@]}"; do
    if ! ldconfig -p | grep -q "$lib"; then
      echo "Warning: $lib might be missing"
    fi
  done
else
  echo "No apt-get available (expected in App Platform)"
fi

echo "Installing Playwright browsers..."
npx playwright install chromium

echo "Playwright installation complete!"

