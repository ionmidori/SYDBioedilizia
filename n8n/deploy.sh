#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy n8n to Google Cloud Run (FREE tier)
#
# Prerequisites:
#   1. gcloud CLI authenticated: gcloud auth login
#   2. PostgreSQL database ready (Supabase — see README)
#   3. Copy .env.n8n.example → .env.n8n and fill all values
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
# NOTE — this script is additive on purpose. It uses `--update-env-vars`, not
# `--set-env-vars`: the live service carries vars set outside this script
# (N8N_HOST, WEBHOOK_URL, SYD_INTERNAL_TOKEN, …) and `--set-env-vars` would
# delete every one of them. Never swap the flag back.
# =============================================================================
set -euo pipefail

# ── Project config (matches existing syd-brain deployment) ──────────────────
PROJECT_ID="chatbotluca-a8a73"
REGION="europe-west1"
SERVICE_NAME="syd-n8n"
# Pinned: n8n majors ship breaking DB migrations, and a migration applied by a
# surprise `:latest` is not reversible. Bump deliberately, then verify /health.
N8N_IMAGE="docker.io/n8nio/n8n:${N8N_IMAGE_TAG:-2.20.7}"

# ── Load env vars ─────────────────────────────────────────────────────────────
ENV_FILE="$(dirname "$0")/.env.n8n"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env.n8n not found. Copy .env.n8n.example and fill the values."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

# ── Validate required vars ───────────────────────────────────────────────────
REQUIRED_VARS=(
  N8N_ENCRYPTION_KEY
  DB_POSTGRESDB_HOST
  DB_POSTGRESDB_USER
  DB_POSTGRESDB_PASSWORD
  DB_POSTGRESDB_DATABASE
)
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: Required variable $var is not set in .env.n8n"
    exit 1
  fi
done

echo "▶ Deploying n8n to Cloud Run (${N8N_IMAGE} — public image, no build required)..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$N8N_IMAGE" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --concurrency 10 \
  --min-instances 0 \
  --max-instances 3 \
  --project "$PROJECT_ID" \
  --update-env-vars "DB_TYPE=postgresdb" \
  --update-env-vars "DB_POSTGRESDB_HOST=${DB_POSTGRESDB_HOST}" \
  --update-env-vars "DB_POSTGRESDB_PORT=${DB_POSTGRESDB_PORT:-5432}" \
  --update-env-vars "DB_POSTGRESDB_DATABASE=${DB_POSTGRESDB_DATABASE}" \
  --update-env-vars "DB_POSTGRESDB_USER=${DB_POSTGRESDB_USER}" \
  --update-env-vars "DB_POSTGRESDB_PASSWORD=${DB_POSTGRESDB_PASSWORD}" \
  --update-env-vars "DB_POSTGRESDB_SSL_ENABLED=true" \
  --update-env-vars "DB_POSTGRESDB_SSL_REJECT_UNAUTHORIZED=false" \
  --update-env-vars "N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}" \
  --update-env-vars "EXECUTIONS_PROCESS=main" \
  --update-env-vars "N8N_PUSH_BACKEND=sse" \
  --update-env-vars "N8N_DIAGNOSTICS_ENABLED=false" \
  --update-env-vars "N8N_VERSION_NOTIFICATIONS_ENABLED=false" \
  --update-env-vars "N8N_SECURE_COOKIE=false" \
  --update-env-vars "N8N_PORT=8080"

# ── Pin traffic to the new revision ──────────────────────────────────────────
# A service whose traffic is pinned to an old revision silently swallows every
# later env-var update: the new revision is created but never serves. This has
# already cost us one outage (Phase 92k), so assert it on every deploy.
echo "▶ Routing 100% traffic to the latest revision..."
gcloud run services update-traffic "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --to-latest

# ── Retrieve the deployed URL ─────────────────────────────────────────────────
N8N_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format "value(status.url)")

echo ""
echo "✅ n8n deployed successfully!"
echo ""
echo "   URL:       ${N8N_URL}"
echo "   UI:        ${N8N_URL} (login with the n8n owner account)"
echo "   Webhook:   ${N8N_URL}/webhook/<workflow-path>"
echo ""
echo "── Next steps ────────────────────────────────────────────────────────────"
echo "1. Open ${N8N_URL} and log in"
echo "2. Import workflows from n8n_workflows/*.json (error_handler first)"
echo "3. Configure credentials: SMTP, Telegram"
echo "4. Update backend_python/.env:"
echo "   N8N_WEBHOOK_NOTIFY_ADMIN=${N8N_URL}/webhook/syd-notify-admin"
echo "   N8N_WEBHOOK_DELIVER_QUOTE=${N8N_URL}/webhook/syd-deliver-quote"
echo "5. Activate workflows in n8n UI"
echo ""
