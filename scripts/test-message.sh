#!/usr/bin/env bash
# Send a test message directly to the webhook endpoint (bypasses OpenClaw / WhatsApp).
# Usage: bash scripts/test-message.sh "add milk, eggs, bananas"

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "ERROR: .env not found."
  exit 1
fi

# Load PORT and WHATSAPP_SELF_JID from .env
source .env 2>/dev/null || true

PORT="${PORT:-3457}"
JID="${WHATSAPP_SELF_JID:-test@s.whatsapp.net}"
TEXT="${1:-add milk}"

echo "Sending test message to http://127.0.0.1:${PORT}/webhook/whatsapp"
echo "  JID:  $JID"
echo "  Text: $TEXT"
echo ""

curl -s -X POST "http://127.0.0.1:${PORT}/webhook/whatsapp" \
  -H "Content-Type: application/json" \
  -d "{\"jid\":\"$JID\",\"text\":\"$TEXT\",\"timestamp\":$(date +%s),\"messageId\":\"test-$(date +%s)\"}" \
  | jq .
