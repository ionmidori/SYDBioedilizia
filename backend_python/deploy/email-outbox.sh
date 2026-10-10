#!/usr/bin/env bash
# Email outbox infrastructure for syd-brain (Phase 128 — Fase 4).
#
# The code sends with the provider in EMAIL_PROVIDER (smtp = the Gmail account
# already configured on the service). What the code cannot create by itself:
#   1. the Firestore indexes the sweeper queries (status + next_attempt_at / lease_until);
#   2. a dedicated service account whose OIDC token Cloud Scheduler sends;
#   3. the Cloud Scheduler job (every 5 minutes) → POST /internal/email/sweep;
#   4. the env vars telling the backend which audience/identity to accept.
#
# Each step is explicit and idempotent:
#   bash backend_python/deploy/email-outbox.sh indexes   # additive, does not touch existing indexes
#   bash backend_python/deploy/email-outbox.sh sweeper   # SA + env vars (new revision) + Scheduler job
#   bash backend_python/deploy/email-outbox.sh status    # what is configured
#   bash backend_python/deploy/email-outbox.sh pause     # stop the sweeper (job paused, nothing deleted)
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
SWEEPER_SA_NAME="${SWEEPER_SA_NAME:-syd-email-sweeper}"
SWEEPER_SA="$SWEEPER_SA_NAME@$PROJECT.iam.gserviceaccount.com"
JOB="${JOB:-syd-email-sweep}"

service_url() {
  gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format='value(status.url)'
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
  sweeper)
    url="$(service_url)"
    audience="$url/internal/email/sweep"
    if ! gcloud iam service-accounts describe "$SWEEPER_SA" --project="$PROJECT" >/dev/null 2>&1; then
      gcloud iam service-accounts create "$SWEEPER_SA_NAME" --project="$PROJECT" \
        --display-name="Cloud Scheduler → email outbox sweep (OIDC only, no other role)"
    fi
    # The service is public; invoker is granted anyway so the sweep keeps
    # working if the service is ever made private.
    gcloud run services add-iam-policy-binding "$SERVICE" --region="$REGION" --project="$PROJECT" \
      --member="serviceAccount:$SWEEPER_SA" --role="roles/run.invoker" --quiet >/dev/null
    gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" --quiet \
      --update-env-vars="EMAIL_SWEEP_AUDIENCE=$audience,EMAIL_SWEEP_INVOKER_EMAIL=$SWEEPER_SA"
    if gcloud scheduler jobs describe "$JOB" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
      verb=update
    else
      verb=create
    fi
    gcloud scheduler jobs "$verb" http "$JOB" --location="$REGION" --project="$PROJECT" \
      --schedule="*/5 * * * *" --time-zone="Europe/Rome" \
      --uri="$audience" --http-method=POST \
      --oidc-service-account-email="$SWEEPER_SA" --oidc-token-audience="$audience" \
      --attempt-deadline=120s
    echo "Sweeper: $JOB → $audience as $SWEEPER_SA"
    ;;
  brevo)
    gcloud run services update "$SERVICE" --region="$REGION" --project="$PROJECT" --quiet \
      --update-secrets="BREVO_API_KEY=syd-brain-brevo-api-key:latest,BREVO_WEBHOOK_TOKEN=syd-brain-brevo-webhook-token:latest" \
      --update-env-vars="EMAIL_PROVIDER=brevo"
    ;;
  pause)
    gcloud scheduler jobs pause "$JOB" --location="$REGION" --project="$PROJECT"
    ;;
  status)
    gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format=json \
      | python -c "import json,sys; e=json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env',[]); [print(v['name'], v.get('value', '(secret)')) for v in e if v['name'].startswith(('EMAIL_','BREVO_','SMTP_HOST'))]"
    gcloud scheduler jobs describe "$JOB" --location="$REGION" --project="$PROJECT" \
      --format='value(state,schedule,httpTarget.uri,httpTarget.oidcToken.serviceAccountEmail)' 2>/dev/null \
      || echo "Scheduler job $JOB: not created"
    gcloud firestore indexes composite list --project="$PROJECT" \
      --format='value(collectionGroup,state,fields.fieldPath.list())' | grep email_outbox || echo "no email_outbox index"
    ;;
  *)
    echo "usage: $0 indexes|sweeper|status|pause|brevo" >&2
    exit 2
    ;;
esac
