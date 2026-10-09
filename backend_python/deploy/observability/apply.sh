#!/usr/bin/env bash
# Chat latency observability for syd-brain: log-based metrics + TTFT alert.
#
# Run AFTER the code emitting `chat_turn_timing` (chat latency plan, Phase 0)
# is deployed. Idempotent: metrics are created or updated.
#
#   bash backend_python/deploy/observability/apply.sh
#   NOTIFICATION_CHANNEL=projects/<p>/notificationChannels/<id> bash .../apply.sh
#
# List channels: gcloud beta monitoring channels list --format="value(name,displayName)"
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-chatbotluca-a8a73}"

for spec in chat_ttft_ms chat_total_ms chat_llm_ms chat_queued_ms; do
  if gcloud logging metrics describe "$spec" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$spec" --project="$PROJECT" --config-from-file="$spec.yaml"
  else
    gcloud logging metrics create "$spec" --project="$PROJECT" --config-from-file="$spec.yaml"
  fi
done

existing=$(gcloud alpha monitoring policies list --project="$PROJECT" \
  --filter='displayName="Chat TTFT p95 > 3s (syd-brain)"' --format='value(name)')
if [[ -z "$existing" ]]; then
  args=(--project="$PROJECT" --policy-from-file=alert-ttft.yaml)
  if [[ -n "${NOTIFICATION_CHANNEL:-}" ]]; then
    args+=(--notification-channels="$NOTIFICATION_CHANNEL")
  fi
  gcloud alpha monitoring policies create "${args[@]}"
else
  echo "Alert policy already exists: $existing"
fi
