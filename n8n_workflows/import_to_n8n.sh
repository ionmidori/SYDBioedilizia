#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# SYD n8n Workflow Importer
# Usage: N8N_API_KEY=<your_key> bash import_to_n8n.sh
# ─────────────────────────────────────────────────────────────────

set -e

N8N_URL="https://apaxhud.app.n8n.cloud"
API_KEY="${N8N_API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "❌ ERROR: Set N8N_API_KEY environment variable first"
  echo "   export N8N_API_KEY=your_key_here"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

import_workflow() {
  local file="$1"
  local name="$2"
  echo "📦 Importing: $name"
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "${N8N_URL}/api/v1/workflows" \
    -H "X-N8N-API-KEY: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d @"${SCRIPT_DIR}/${file}")

  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | head -1)

  if [ "$http_code" = "200" ] || [ "$http_code" = "201" ]; then
    workflow_id=$(echo "$body" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8'); console.log(JSON.parse(d).id || 'unknown')" 2>/dev/null || echo "unknown")
    echo "   ✅ Created (ID: $workflow_id)"
  else
    echo "   ❌ Failed (HTTP $http_code): $body"
  fi
}

echo "🚀 SYD n8n Workflow Import — $(date)"
echo "   Instance: $N8N_URL"
echo ""

# Order matters: Error Handler must be first (referenced by others)
import_workflow "workflow_error_handler.json"       "SYD — Error Handler (Centralizzato)"
import_workflow "workflow_notify_admin.json"         "SYD — Notify Admin (Quote Ready) v2"
import_workflow "workflow_deliver_quote.json"        "SYD — Deliver Quote (Approved PDF) v2"
import_workflow "workflow_firestore_status_poller.json" "SYD — Firestore Status Poller"

echo ""
echo "✅ Import complete!"
echo ""
echo "⚙️  Next steps — configure these environment variables in n8n Settings > Variables:"
echo "   SYD_WEBHOOK_SECRET    = (same as in backend_python/.env)"
echo "   ADMIN_EMAIL           = your admin email"
echo "   SYD_BACKEND_URL       = https://your-cloud-run-url"
echo "   SYD_INTERNAL_TOKEN    = (generate with: openssl rand -hex 32)"
echo "   TELEGRAM_ADMIN_CHAT_ID = your Telegram chat ID (optional)"
echo "   N8N_INSTANCE_URL      = https://apaxhud.app.n8n.cloud"
