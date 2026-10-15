#!/usr/bin/env bash
# Observability for syd-brain: log-based metrics + alert policies.
#   - chat latency (`chat_turn_timing`, chat latency plan): 4 metrics + TTFT alert
#   - email outbox (`email_dead_letter`, #478): 1 metric + dead-letter alert
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

for spec in chat_ttft_ms chat_total_ms chat_llm_ms chat_queued_ms email_dead_letter; do
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
