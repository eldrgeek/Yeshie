#!/bin/bash

echo "🔄 Restarting Chrome with debugging enabled (Enhanced)..."
echo "📦 This will preserve your extension and session"

# Close existing Chrome (gracefully)
echo "🚪 Closing existing Chrome instances..."
osascript -e 'quit app "Google Chrome"'
sleep 3

# Kill any remaining Chrome processes more thoroughly
pkill -f "Google Chrome" 2>/dev/null || true
pkill -f "chrome" 2>/dev/null || true
sleep 3

# Find the extension path
EXTENSION_PATH="../../extension/build/chrome-mv3-dev"
if [ ! -d "$EXTENSION_PATH" ]; then
    echo "❌ Extension not found at $EXTENSION_PATH"
    echo "💡 Run 'cd extension && pnpm run build' first"
    exit 1
fi

echo "📁 Extension path: $(realpath $EXTENSION_PATH)"

# Use the default Chrome profile to preserve existing logins
CHROME_PROFILE="$HOME/Library/Application Support/Google/Chrome"
echo "🆔 Using your default Chrome profile: $CHROME_PROFILE"

# Start Chrome with debugging and extension (enhanced flags for macOS)
echo "🚀 Starting Chrome with debugging enabled (enhanced)..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --remote-debugging-address=127.0.0.1 \
    --remote-allow-origins=http://localhost:9222,http://127.0.0.1:9222 \
    --load-extension="$(realpath $EXTENSION_PATH)" \
    --disable-extensions-except="$(realpath $EXTENSION_PATH)" \
    --user-data-dir="~/profile-debug" \
    --disable-infobars \
    --disable-extensions-file-access-check \
    --disable-popup-blocking \
    --disable-default-apps \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=TranslateUI,VizDisplayCompositor \
    --disable-ipc-flooding-protection \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --window-size=1200,800 \
    --new-window \
    > /dev/null 2>&1 &

echo "⏳ Waiting for Chrome to initialize..."
sleep 8

# Get the actual Chrome PID
CHROME_PID=$(pgrep -f "remote-debugging-port=9222" | head -1)

if [ -z "$CHROME_PID" ]; then
    echo "❌ Chrome failed to start with debugging enabled"
    exit 1
fi

echo "✅ Chrome restarted with debugging enabled (PID: $CHROME_PID)"

# Test if debugging port is accessible
echo "🔍 Testing debugging port..."
sleep 2

if curl -s --connect-timeout 5 http://localhost:9222/json > /dev/null; then
    echo "✅ Debugging port is accessible!"
    echo "🌐 DevTools endpoint: http://localhost:9222"
else
    echo "⚠️ Debugging port may not be ready yet, trying again..."
    sleep 3
    if curl -s --connect-timeout 5 http://localhost:9222/json > /dev/null; then
        echo "✅ Debugging port is now accessible!"
    else
        echo "❌ Debugging port is still not accessible"
        echo "💡 You may need to:"
        echo "   1. Try a reboot"
        echo "   2. Check Chrome security settings"
        echo "   3. Use manual DevTools (chrome://extensions)"
    fi
fi

echo ""
echo "🆔 Your existing Chrome profile and logins should be preserved"
echo "🔍 To test CDP connection: node simple-cdp-test.js"
echo "📋 To monitor console logs: node read-console-logs.js" 