#!/usr/bin/env bash
# Email outbox infrastructure for syd-brain (Phase 128 — Fase 4).
#
# The code sends with the provider in EMAIL_PROVIDER (smtp = the Gmail account
# already configured on the service). Retries are EVENT-DRIVEN (owner's
# requirement: no job waking the service around the clock): Cloud Tasks runs
# a dispatch only when an email was queued (one delayed safety check) or a
# send failed (one task at the retry time). No email → nothing runs.
#
# What the code cannot create by itself:
#   1. the Firestore indexes the manual sweep queries;
#   2. the Cloud Tasks queue + a dedicated service account whose OIDC token the
#      tasks carry (verified by POST /internal/email/dispatch/{id});
#   3. permissions for the runtime SA to enqueue tasks as that account;
#   4. the env vars telling the backend the queue, URL, audience and identity.
#
# Each step is explicit and idempotent:
#   bash backend_python/deploy/email-outbox.sh indexes  # additive, does not touch existing indexes
#   bash backend_python/deploy/email-outbox.sh tasks    # API, queue, SA, IAM, env (new revision); removes the old Scheduler job
#   bash backend_python/deploy/email-outbox.sh sweep    # one manual recovery sweep (calls the endpoint with an OIDC token)
#   bash backend_python/deploy/email-outbox.sh status   # what is configured
#
# Later, when the domain is verified on Brevo (Fase 0):
#   gcloud secrets create syd-brain-brevo-api-key --data-file=-       (paste the key)
#   gcloud secrets create syd-brain-brevo-webhook-token --data-file=- (>=32 random chars)
#   bash backend_python/deploy/email-outbox.sh brevo     # mounts both secrets, EMAIL_PROVIDER=brevo
#   then on Brevo: Transactional → Webhooks → URL https://<service>/webhooks/email/brevo,
#   authentication "Bearer" with the same token, events delivered / hard_bounce /
#   soft_bounce / spam / blocked / invalid_email / error.
set -euo pipefail

SERVICE="${SERVICE:-syd-brain}"
REGION="${REGION:-europe-west1}"
PROJECT="${PROJECT:-chatbotluca-a8a73}"
QUEUE="${QUEUE:-syd-email-outbox}"
INVOKER_SA_NAME="${INVOKER_SA_NAME:-syd-email-sweeper}"
INVOKER_SA="$INVOKER_SA_NAME@$PROJECT.iam.gserviceaccount.com"
OLD_JOB="${OLD_JOB:-syd-email-sweep}"

service_url() {
  gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)'
}

runtime_sa() {
  gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
    --format='value(spec.template.spec.serviceAccountName)'
}

case "${1:-}" in
  indexes)
    for second in next_attempt_at lease_until; do
      gcloud firestore indexes composite create --project="$PROJECT" \
        --collection-group=email_outbox --query-scope=COLLECTION \
        --field-config="field-path=status,order=ascending" \
        --field-config="field-path=$second,order=ascending" --async \
        || echo "(index on status+$second already exists?)"
    done
    ;;
  tasks)
    url="$(service_url)"
    runtime="$(runtime_sa)"
    gcloud services enable cloudtasks.googleapis.com --project="$PROJECT"
    if ! gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
      # Retries of the HTTP call itself (endpoint 5xx); send retries are decided
      # by the outbox, which schedules its own task at the retry time.
      gcloud tasks queues create "$QUEUE" --location="$REGION" --project="$PROJECT" \
        --max-attempts=3 --min-backoff=30s --max-backoff=300s --max-dispatches-per-second=5
    fi
    if ! gcloud iam service-accounts describe "$INVOKER_SA" --project="$PROJECT" >/dev/null 2>&1; then
      gcloud iam service-accounts create "$INVOKER_SA_NAME" --project="$PROJECT" \
        --display-name="Cloud Tasks → email outbox (OIDC only)"
    fi
    # Invoker on the service (public today; keeps working if made private).
    gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" --project="$PROJECT" \
      --member="serviceAccount:$INVOKER_SA" --role="roles/run.invoker" --quiet >/dev/null
    # The runtime SA may enqueue on THIS queue only, and mint OIDC tokens as the invoker SA only.
    gcloud tasks queues add-iam-policy-binding "$QUEUE" --location="$REGION" --project="$PROJECT" \
      --member="serviceAccount:$runtime" --role="roles/cloudtasks.enqueuer" >/dev/null
    gcloud iam service-accounts add-iam-policy-binding "$INVOKER_SA" --project="$PROJECT" \
      --member="serviceAccount:$runtime" --role="roles/iam.serviceAccountUser" >/dev/null
    gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" --quiet \
      --update-env-vars="EMAIL_TASKS_QUEUE=$QUEUE,EMAIL_TASKS_LOCATION=$REGION,EMAIL_INTERNAL_BASE_URL=$url,EMAIL_INTERNAL_AUDIENCE=$url,EMAIL_INTERNAL_INVOKER_EMAIL=$INVOKER_SA" \
      --remove-env-vars="EMAIL_SWEEP_AUDIENCE,EMAIL_SWEEP_INVOKER_EMAIL"
    # The old always-on job (every 5 min, 24h) is no longer needed.
    if gcloud scheduler jobs describe "$OLD_JOB" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
      gcloud scheduler jobs delete "$OLD_JOB" --location="$REGION" --project="$PROJECT" --quiet
    fi
    echo "Event-driven retries: queue $QUEUE → $url/internal/email/dispatch/{id} as $INVOKER_SA"
    ;;
  sweep)
    url="$(service_url)"
    token="$(gcloud auth print-identity-token --impersonate-service-account="$INVOKER_SA" --audiences="$url" --include-email)"
    curl -sS -X POST -H "Authorization: Bearer $token" "$url/internal/email/sweep"
    echo
    ;;
  brevo)
    gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" --quiet \
      --update-secrets="BREVO_API_KEY=syd-brain-brevo-api-key:latest,BREVO_WEBHOOK_TOKEN=syd-brain-brevo-webhook-token:latest" \
      --update-env-vars="EMAIL_PROVIDER=brevo"
    ;;
  status)
    gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format=json \
      | python -c "import json,sys; e=json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env',[]); [print(v['name'], v.get('value', '(secret)')) for v in e if v['name'].startswith(('EMAIL_','BREVO_','SMTP_HOST'))]"
    gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT" \
      --format='value(name.basename(),state)' 2>/dev/null || echo "Cloud Tasks queue $QUEUE: not created"
    gcloud scheduler jobs describe "$OLD_JOB" --location="$REGION" --project="$PROJECT" \
      --format='value(state)' 2>/dev/null && echo "(old Scheduler job still present)" || echo "No recurring Scheduler job (as intended)"
    # value() does not print the collection group: match the outbox index fields.
    gcloud firestore indexes composite list --project="$PROJECT" \
      --format='value(state,fields.fieldPath.list())' | grep -E "status,(next_attempt_at|lease_until)" \
      || echo "no email_outbox index"
    ;;
  *)
    echo "usage: $0 indexes|tasks|sweep|status|brevo" >&2
    exit 2
    ;;
esac
