#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Copy .env.example and fill in your values."
  exit 1
fi

echo "Starting grocery assistant in dev mode..."
npm run dev
