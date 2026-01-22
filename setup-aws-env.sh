#!/bin/bash

# Setup AWS environment on EC2
# This script configures .env file for DynamoDB access

set -e

PROJECT_DIR="/home/ubuntu/lrivoriginal/Desktop/origin"

if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

# Create .env file with AWS configuration
# Note: AWS credentials should be from IAM role, not hardcoded
cat > .env << 'EOF'
# AWS Configuration
AWS_REGION=us-east-1
DYNAMODB_ADSTERRA_RUNS_TABLE=AdsterraRuns
DYNAMODB_ADSTERRA_JOBS_TABLE=AdsterraJobs

# BrightData Proxy Configuration
PROXY_PROVIDER=brightdata
BRIGHTDATA_HOST=brd.superproxy.io
BRIGHTDATA_PORT=33335
BRIGHTDATA_USERNAME=brd-customer-hl_b2282e51-zone-mobile_proxy1
BRIGHTDATA_PASSWORD=y3s56h315vob
BRIGHTDATA_ZONE=mobile_proxy1

# Browser Configuration
BROWSER_HEADLESS=true
BROWSER_TIMEOUT=30000
EOF

echo "✅ Created .env file at $PROJECT_DIR/.env"

# Verify the file was created
if [ -f "$PROJECT_DIR/.env" ]; then
    echo "✅ .env file verified"
    echo "📋 Contents (redacted):"
    cat "$PROJECT_DIR/.env" | grep -v "PASSWORD\|KEY" || true
else
    echo "❌ Failed to create .env file"
    exit 1
fi

# Restart the worker to pick up new environment
echo "🔄 Restarting worker..."
if command -v pm2 &> /dev/null; then
    pm2 restart worker || echo "⚠️  PM2 worker restart command issued"
    sleep 2
    pm2 logs worker --lines 20
else
    echo "⚠️  PM2 not found, manual restart may be needed"
fi

echo "✅ Setup complete!"
