#!/bin/bash

# Setup script for Codex sandbox environment
# Installs dependencies and configures the .env file

set -e

# Accept OPENAI_API_KEY via environment variable or first argument
if [ -z "$OPENAI_API_KEY" ]; then
  OPENAI_API_KEY="$1"
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "OPENAI_API_KEY must be provided as an environment variable or first argument"
  exit 1
fi

# Install pnpm if not present
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm
fi

# Install node dependencies for root workspace and sub-packages
pnpm install
pnpm --filter ./client install
pnpm --filter ./extension install
pnpm --filter ./shared install

# Install Python dependencies
python3 -m pip install --upgrade pip
pip3 install -r requirements.txt

# Create .env with the provided API key
cat > .env <<EOVAR
OPENAI_API_KEY=$OPENAI_API_KEY
PORT=3001
EOVAR

echo "Environment setup complete"
