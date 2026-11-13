#!/usr/bin/env bash
# Observability for syd-brain: log-based metrics + alert policies.
#   - chat latency (`chat_turn_timing`, chat latency plan): 4 metrics + TTFT alert
#   - email outbox (`email_dead_letter`, #478): 1 metric + dead-letter alert
#   - App Check fallback (`app_check_auth_fallback`): 1 metric, no alert
#   - failed chat turns (`chat_turn_failed`): 1 metric + alert; Cloud Run 5xx alert
#   - uptime check on /health (every 5 min, 30 s timeout) + alert
#
# Run AFTER the code emitting those log lines is deployed. Idempotent: metrics
# are created or updated, policies created only if missing (by displayName).
#
#   bash backend_python/deploy/observability/apply.sh
#   NOTIFICATION_CHANNEL=projects/<p>/notificationChannels/<id> bash .../apply.sh
#
# List channels: gcloud beta monitoring channels list --format="value(name,displayName)"
# NOTIFICATION_CHANNEL is attached only to policies created by this run; an
# existing policy keeps its channels (edit them in the console).
#
# Dead-letter alert test (after apply): the metric only counts Cloud Run lines,
# so check the chain on the first real dead-letter, or force one in a staging
# deploy (e.g. EMAIL_MAX_ATTEMPTS=1 and an unreachable SMTP host), then confirm
# the email arrives within ~5 min and Logs Explorer shows
#   resource.labels.service_name="syd-brain" jsonPayload.event="email_dead_letter"
set -euo pipefail
cd "$(dirname "$0")"
PROJECT="${PROJECT:-chatbotluca-a8a73}"

for spec in chat_ttft_ms chat_total_ms chat_llm_ms chat_queued_ms email_dead_letter app_check_auth_fallback chat_turn_failed; do
  if gcloud logging metrics describe "$spec" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$spec" --project="$PROJECT" --config-from-file="$spec.yaml"
  else
    gcloud logging metrics create "$spec" --project="$PROJECT" --config-from-file="$spec.yaml"
  fi
done

# ensure_policy <displayName> <policy file>
ensure_policy() {
  local name="$1" file="$2" existing attempt
  # Assigned on its own line: a gcloud failure here must stop the script
  # (set -e does not fire inside `[[ ... ]]`).
  existing=$(gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=\"$name\"" --format='value(name)')
  if [[ -n "$existing" ]]; then
    echo "Alert policy already exists: $existing"
    return
  fi
  local created
  # A just-created log-based metric can take a minute to become visible to
  # Monitoring ("Cannot find metric(s) that match type"): retry before failing.
  for attempt in 1 2 3 4 5 6; do
    if created=$(gcloud alpha monitoring policies create --project="$PROJECT"         --policy-from-file="$file" --format='value(name)'); then
      echo "Created alert policy: $created"
      # `create --policy-from-file` ignores --notification-channels: attach
      # the channel with an update, or the policy fires without notifying.
      if [[ -n "${NOTIFICATION_CHANNEL:-}" ]]; then
        gcloud alpha monitoring policies update "$created" --project="$PROJECT"           --add-notification-channels="$NOTIFICATION_CHANNEL" --format='value(name)' >/dev/null
        echo "  notification channel attached: $NOTIFICATION_CHANNEL"
      fi
      return
    fi
    if [[ "$attempt" == 6 ]]; then
      echo "Could not create \"$name\" after 6 attempts." >&2
      exit 1
    fi
    echo "Metric not visible to Monitoring yet, retrying in 15 s ($attempt/6)..."
    sleep 15
  done
}

ensure_policy "Chat TTFT p95 > 3s (syd-brain)" alert-ttft.yaml
ensure_policy "Email dead-letter (syd-brain)" alert-email-dead-letter.yaml
ensure_policy "Chat turn failed (syd-brain)" alert-chat-turn-failed.yaml
ensure_policy "Cloud Run 5xx (syd-brain)" alert-cloud-run-5xx.yaml

# Uptime check on /health: created only if missing (by displayName). The service scales to
# zero and a cold start takes up to ~30 s, hence the 30 s timeout; the alert waits for two
# failed checks in a row. The check also keeps one instance warm.
# If you delete and recreate the check, delete the "Uptime /health" policy too: an existing
# policy is not updated and would keep pointing at the old check id (and stay silent).
UPTIME_NAME="syd-brain /health"
UPTIME_HOST=$(gcloud run services describe syd-brain --region="${REGION:-europe-west1}"   --project="$PROJECT" --format='value(status.url)')
UPTIME_HOST="${UPTIME_HOST#https://}"
UPTIME_ID=$(gcloud monitoring uptime list-configs --project="$PROJECT"   --filter="displayName=\"$UPTIME_NAME\"" --format='value(name.basename())' | head -n1)
if [[ -z "$UPTIME_ID" ]]; then
  gcloud monitoring uptime create "$UPTIME_NAME" --project="$PROJECT"     --resource-type=uptime-url --resource-labels="host=$UPTIME_HOST,project_id=$PROJECT"     --protocol=https --path=/health --period=5 --timeout=30 --status-classes=2xx --validate-ssl=true
  UPTIME_ID=$(gcloud monitoring uptime list-configs --project="$PROJECT"     --filter="displayName=\"$UPTIME_NAME\"" --format='value(name.basename())')
fi
[[ -n "$UPTIME_ID" ]] || { echo "Uptime check \"$UPTIME_NAME\" not found." >&2; exit 1; }
UPTIME_POLICY="$(mktemp)"
sed "s/__UPTIME_CHECK_ID__/$UPTIME_ID/" alert-uptime-health.yaml > "$UPTIME_POLICY"
ensure_policy "Uptime /health (syd-brain)" "$UPTIME_POLICY"
rm -f "$UPTIME_POLICY"
