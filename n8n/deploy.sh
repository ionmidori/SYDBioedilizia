#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy n8n to Google Cloud Run (FREE tier)
#
# Prerequisites:
#   1. gcloud CLI authenticated: gcloud auth login
#   2. PostgreSQL database ready (Neon free tier — see README)
#   3. Copy .env.n8n.example → .env.n8n and fill all values
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# =============================================================================
set -euo pipefail

# ── Project config (matches existing syd-brain deployment) ──────────────────
PROJECT_ID="chatbotluca-a8a73"
REGION="europe-west1"
AR_HOSTNAME="${REGION}-docker.pkg.dev"
AR_REPOSITORY="cloud-run-source-deploy"
SERVICE_NAME="syd-n8n"
IMAGE="${AR_HOSTNAME}/${PROJECT_ID}/${AR_REPOSITORY}/${SERVICE_NAME}:latest"

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
  N8N_BASIC_AUTH_USER
  N8N_BASIC_AUTH_PASSWORD
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

echo "▶ Building and pushing Docker image to Artifact Registry..."
gcloud builds submit \
  --tag "$IMAGE" \
  --project "$PROJECT_ID" \
  "$(dirname "$0")"

echo "▶ Deploying n8n to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE" \
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
  --set-env-vars "DB_TYPE=postgresdb" \
  --set-env-vars "DB_POSTGRESDB_HOST=${DB_POSTGRESDB_HOST}" \
  --set-env-vars "DB_POSTGRESDB_PORT=${DB_POSTGRESDB_PORT:-5432}" \
  --set-env-vars "DB_POSTGRESDB_DATABASE=${DB_POSTGRESDB_DATABASE}" \
  --set-env-vars "DB_POSTGRESDB_USER=${DB_POSTGRESDB_USER}" \
  --set-env-vars "DB_POSTGRESDB_PASSWORD=${DB_POSTGRESDB_PASSWORD}" \
  --set-env-vars "DB_POSTGRESDB_SSL_ENABLED=true" \
  --set-env-vars "N8N_ENCRYPTION_KEY=${N8N_ENCRYPTION_KEY}" \
  --set-env-vars "N8N_BASIC_AUTH_ACTIVE=true" \
  --set-env-vars "N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}" \
  --set-env-vars "N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}" \
  --set-env-vars "EXECUTIONS_PROCESS=main" \
  --set-env-vars "N8N_PUSH_BACKEND=sse" \
  --set-env-vars "N8N_DIAGNOSTICS_ENABLED=false" \
  --set-env-vars "N8N_VERSION_NOTIFICATIONS_ENABLED=false" \
  --set-env-vars "N8N_SECURE_COOKIE=false"

# ── Retrieve the deployed URL ─────────────────────────────────────────────────
N8N_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --project "$PROJECT_ID" \
  --format "value(status.url)")

echo ""
echo "✅ n8n deployed successfully!"
echo ""
echo "   URL:       ${N8N_URL}"
echo "   UI:        ${N8N_URL} (login with N8N_BASIC_AUTH_USER / PASSWORD)"
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
