#!/usr/bin/env bash
set -e

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required but not installed. Please install Node.js and pnpm." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but not installed." >&2
  exit 1
fi

# Install Node.js workspace dependencies
echo "Installing Node dependencies..."
pnpm install

# Install Python dependencies
echo "Installing Python dependencies..."
python3 -m pip install -r requirements.txt
python3 -m pip install -r tests/e2e/requirements.txt
python3 -m pip install -r yeshie/server/requirements.txt

# Install Playwright browsers if available
if command -v npx >/dev/null 2>&1; then
  echo "Installing Playwright browsers..."
  npx playwright install
fi

echo "Setup complete. You can now run tests with 'pnpm test' or start development with 'pnpm run dev'."
