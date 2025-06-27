#!/bin/bash

echo "🟣 Launching Plasmo Development Mode with Chrome Debugging..."
echo "📦 This will start Plasmo dev server + Chrome with debugging enabled"

# Function to cleanup on exit
cleanup() {
    echo "🧹 Cleaning up processes..."
    pkill -f "plasmo dev" 2>/dev/null || true
    pkill -f "remote-debugging-port=9222" 2>/dev/null || true
    exit 0
}

# Trap to ensure cleanup on script exit
trap cleanup EXIT INT TERM

# Close existing Chrome instances
echo "🚪 Closing existing Chrome instances..."
osascript -e 'quit app "Google Chrome"' 2>/dev/null || true
sleep 2
pkill -f "Google Chrome" 2>/dev/null || true
pkill -f "chrome" 2>/dev/null || true
sleep 2

# Kill any existing Plasmo dev processes
pkill -f "plasmo dev" 2>/dev/null || true
sleep 1

# Create debug profile directory
DEBUG_PROFILE="./chrome-debug-profile"
rm -rf "$DEBUG_PROFILE" 2>/dev/null || true
mkdir -p "$DEBUG_PROFILE"

echo "🆔 Using debug profile: $(realpath $DEBUG_PROFILE)"

# Start Plasmo in development mode in the background
echo "🚀 Starting Plasmo development server..."
npm run dev &
PLASMO_PID=$!

echo "⏳ Waiting for Plasmo to build extension..."
sleep 8

# Wait for the development build to be ready
MAX_WAIT=30
WAIT_COUNT=0
while [ ! -d "./build/chrome-mv3-dev" ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    echo "⏳ Waiting for Plasmo build... ($WAIT_COUNT/$MAX_WAIT)"
    sleep 2
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ ! -d "./build/chrome-mv3-dev" ]; then
    echo "❌ Plasmo build not ready after ${MAX_WAIT} seconds"
    echo "💡 Check if 'npm run dev' is working correctly"
    kill $PLASMO_PID 2>/dev/null || true
    exit 1
fi

EXTENSION_PATH="./build/chrome-mv3-dev"
echo "📁 Plasmo dev extension: $(realpath $EXTENSION_PATH)"

# Start Chrome with debugging and hot-reload extension
echo "🌐 Starting Chrome with debugging and Plasmo extension..."
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --remote-debugging-port=9222 \
    --remote-debugging-address=127.0.0.1 \
    --remote-allow-origins=http://localhost:9222,http://127.0.0.1:9222,http://localhost:1947 \
    --load-extension="$(realpath $EXTENSION_PATH)" \
    --disable-extensions-except="$(realpath $EXTENSION_PATH)" \
    --user-data-dir="$(realpath $DEBUG_PROFILE)" \
    --disable-infobars \
    --disable-extensions-file-access-check \
    --disable-popup-blocking \
    --disable-default-apps \
    --disable-background-timer-throttling \
    --disable-backgrounding-occluded-windows \
    --disable-renderer-backgrounding \
    --disable-features=TranslateUI \
    --disable-ipc-flooding-protection \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --window-size=1400,900 \
    --new-window \
    "chrome://extensions/" \
    > /dev/null 2>&1 &

CHROME_PID=$!

echo "⏳ Waiting for Chrome to initialize..."
sleep 6

# Verify Chrome is running
if ! ps -p $CHROME_PID > /dev/null; then
    echo "❌ Chrome failed to start"
    kill $PLASMO_PID 2>/dev/null || true
    exit 1
fi

# Test debugging port
echo "🔍 Testing debugging port..."
if curl -s --connect-timeout 5 http://localhost:9222/json > /dev/null; then
    echo "✅ Debugging port is accessible!"
else
    echo "⚠️ Debugging port not ready, waiting..."
    sleep 3
    if curl -s --connect-timeout 5 http://localhost:9222/json > /dev/null; then
        echo "✅ Debugging port is now accessible!"
    else
        echo "❌ Debugging port not accessible"
    fi
fi

echo ""
echo "🟣 Plasmo Development Environment Ready!"
echo "📊 Plasmo Dev Server PID: $PLASMO_PID"
echo "🌐 Chrome Debug PID: $CHROME_PID"
echo "🔍 CDP endpoint: http://localhost:9222"
echo "🔧 Chrome DevTools: chrome://inspect"
echo "📦 Extensions page: chrome://extensions/"
echo ""
echo "🔥 Hot reload is enabled - changes will auto-update!"
echo "🛑 Press Ctrl+C to stop both Plasmo and Chrome"
echo ""

# Wait for user to stop or processes to die
while ps -p $PLASMO_PID > /dev/null && ps -p $CHROME_PID > /dev/null; do
    sleep 2
done

echo "⚠️ One of the processes stopped. Cleaning up..." 