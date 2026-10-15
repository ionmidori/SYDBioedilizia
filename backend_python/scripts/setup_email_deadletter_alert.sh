#!/usr/bin/env bash
# Avviso admin quando una email dell'outbox va in dead-letter (issue #478).
#
# Crea, se mancano (idempotente: rilanciarlo non duplica nulla):
#   1. la metrica log-based `email_dead_letter`, che conta i log
#      jsonPayload.event="email_dead_letter" emessi da _record_failure
#      (src/services/email/outbox.py) sul servizio Cloud Run syd-brain;
#   2. un canale di notifica email verso l'admin;
#   3. una alert policy: almeno un dead-letter in 5 minuti -> email.
#      Ritardo tipico: 2-5 minuti (criterio dell'issue: entro 15).
#
# Indipendente dal provider email che sta fallendo: l'avviso parte da Cloud
# Monitoring, non dall'outbox.
#
# Uso (da backend_python/, con gcloud autenticato su un account con i ruoli
# Logging Admin + Monitoring Admin):
#   ALERT_EMAIL=admin@example.com bash scripts/setup_email_deadletter_alert.sh
#   PROJECT=altro-progetto ALERT_EMAIL=... bash scripts/setup_email_deadletter_alert.sh
#
# ── Runbook di prova (dopo il setup) ─────────────────────────────────────────
# Simula un dead-letter scrivendo un log con la stessa forma di quello reale:
#
#   gcloud logging write email-deadletter-test \
#     '{"event":"email_dead_letter","outbox_id":"TEST","kind":"test","last_error":"permanent:test"}' \
#     --payload-type=json --project="$PROJECT"
#
# ATTENZIONE: `gcloud logging write` scrive su resource.type="global", che la
# metrica (filtrata su cloud_run_revision/syd-brain) NON conta. Per la prova
# completa usare TEST_MODE=1, che crea una metrica e una policy gemelle senza
# filtro sulla risorsa, poi scrivere il log sopra, attendere l'email
# (~5 minuti) e rimuovere le risorse di prova:
#
#   TEST_MODE=1 ALERT_EMAIL=... bash scripts/setup_email_deadletter_alert.sh
#   gcloud logging write ... (come sopra)
#   CLEANUP_TEST=1 bash scripts/setup_email_deadletter_alert.sh
set -euo pipefail

PROJECT="${PROJECT:-chatbotluca-a8a73}"
SERVICE="${SERVICE:-syd-brain}"
TEST_MODE="${TEST_MODE:-0}"
CLEANUP_TEST="${CLEANUP_TEST:-0}"

if [[ "$TEST_MODE" == "1" || "$CLEANUP_TEST" == "1" ]]; then
  METRIC="email_dead_letter_test"
  POLICY_NAME="SYD — email dead-letter (TEST)"
  FILTER='jsonPayload.event="email_dead_letter"'
else
  METRIC="email_dead_letter"
  POLICY_NAME="SYD — email dead-letter"
  FILTER="resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${SERVICE}\" AND jsonPayload.event=\"email_dead_letter\""
fi

policy_id() {
  gcloud alpha monitoring policies list --project="$PROJECT" \
    --filter="displayName=\"${POLICY_NAME}\"" --format='value(name)' | head -n1
}

if [[ "$CLEANUP_TEST" == "1" ]]; then
  id="$(policy_id)"
  [[ -n "$id" ]] && gcloud alpha monitoring policies delete "$id" --project="$PROJECT" --quiet
  gcloud logging metrics delete "$METRIC" --project="$PROJECT" --quiet 2>/dev/null || true
  echo "Risorse di prova rimosse."
  exit 0
fi

: "${ALERT_EMAIL:?Imposta ALERT_EMAIL con l’indirizzo dell’admin}"

# 1. Log-based metric
if gcloud logging metrics describe "$METRIC" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Metrica $METRIC: già presente."
else
  gcloud logging metrics create "$METRIC" --project="$PROJECT" \
    --description="Email dell'outbox finite in dead-letter (#478)" \
    --log-filter="$FILTER"
  echo "Metrica $METRIC: creata."
fi

# 2. Notification channel (riusa quello esistente per lo stesso indirizzo)
CHANNEL="$(gcloud beta monitoring channels list --project="$PROJECT" \
  --filter="type=\"email\" AND labels.email_address=\"${ALERT_EMAIL}\"" \
  --format='value(name)' | head -n1)"
if [[ -z "$CHANNEL" ]]; then
  CHANNEL="$(gcloud beta monitoring channels create --project="$PROJECT" \
    --type=email --display-name="SYD admin (${ALERT_EMAIL})" \
    --channel-labels="email_address=${ALERT_EMAIL}" --format='value(name)')"
  echo "Canale email: creato (${CHANNEL})."
else
  echo "Canale email: già presente (${CHANNEL})."
fi

# 3. Alert policy
if [[ -n "$(policy_id)" ]]; then
  echo "Policy \"${POLICY_NAME}\": già presente."
  exit 0
fi

POLICY_FILE="$(mktemp)"
trap 'rm -f "$POLICY_FILE"' EXIT
cat >"$POLICY_FILE" <<JSON
{
  "displayName": "${POLICY_NAME}",
  "combiner": "OR",
  "conditions": [{
    "displayName": "Almeno un dead-letter in 5 minuti",
    "conditionThreshold": {
      "filter": "metric.type=\"logging.googleapis.com/user/${METRIC}\"",
      "aggregations": [{
        "alignmentPeriod": "300s",
        "perSeriesAligner": "ALIGN_SUM",
        "crossSeriesReducer": "REDUCE_SUM"
      }],
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "0s",
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "1800s" },
  "notificationChannels": ["${CHANNEL}"],
  "documentation": {
    "mimeType": "text/markdown",
    "content": "Una email dell'outbox è andata in dead-letter dopo EMAIL_MAX_ATTEMPTS tentativi o un errore permanente del provider.\n\n1. Logs Explorer: \`jsonPayload.event=\"email_dead_letter\"\` → \`outbox_id\`, \`kind\`, \`project_id\`, \`last_error\`.\n2. Console admin \`/admin\`: il preventivo risulta con consegna \`failed\`.\n3. \`permanent:*\` = indirizzo o contenuto rifiutato; \`transient:*\` = provider giù per tutti i tentativi.\n4. Dopo la correzione, rimandare il preventivo dalla console admin."
  }
}
JSON
gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$POLICY_FILE"
echo "Policy \"${POLICY_NAME}\": creata."
