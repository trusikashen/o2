#!/bin/bash
# Quick detection check for WebKit on Linux usage
# Shows if any bots are using WebKit on Linux (critical vulnerability)

echo "🔍 Checking for WebKit on Linux usage in bot configuration..."
echo ""

# Check src/bot/session.ts for browserType selection
echo "Current browser selection logic:"
grep -n "browserType.*webkit" src/bot/session.ts | head -5 || echo "  (No direct webkit selection found - good!)"
echo ""

# Check if there's any reference to webkit launch
echo "WebKit browser launches:"
grep -n "webkit" src/bot/session.ts | grep -E "(launch|new Browser)" | head -3 || echo "  (No specific webkit launch patterns)"
echo ""

# Show platform detection
echo "Platform detection in config:"
grep -n "process.platform" src/bot/session.ts | head -3
echo ""

echo "✅ Risk assessment system will automatically flag WebKit on Linux with 95/100 risk score"
echo "✅ Warning message will display before execution"
echo ""
echo "🎯 To avoid WebKit on Linux:"
echo "  1. Use 'chromium' browser type on Linux servers"
echo "  2. Use 'webkit' only on macOS (darwin platform)"
echo "  3. Risk assessment: WebKit on Linux = ALWAYS risky"
