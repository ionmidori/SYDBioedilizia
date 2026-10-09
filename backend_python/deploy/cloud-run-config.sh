#!/usr/bin/env bash
# Runtime configuration of the `syd-brain` Cloud Run service — source of truth.
#
# The Cloud Build trigger only runs `gcloud run services update --image=...`,
# which keeps every other setting of the service. These settings are therefore
# applied by this script (idempotent) and NOT by the deploy pipeline: run it once
# after changing a value here, so console edits never drift from the repo.
#
#   bash backend_python/deploy/cloud-run-config.sh            # apply
#   DRY_RUN=1 bash backend_python/deploy/cloud-run-config.sh  # print the command
#
# Choices (chat latency plan, Phase 1):
#   --min-instances=0     scale to zero kept on purpose (no fixed monthly cost);
#                         the cold start is reduced and hidden instead:
#   --cpu-boost           extra CPU during startup: imports and warm-up finish sooner
#   --memory=1Gi          512Mi left little headroom for ADK + genai + Firebase +
#                         Pinecone; more memory also means less GC during import
#   --startup-probe       traffic only once /health/startup is 200, i.e. the
#                         background warm-up is done (no request waits on it)
#   --session-affinity    a conversation keeps hitting the instance that holds
#                         its InMemorySessionService state (no Firestore re-hydration)
#   --concurrency=40      one uvicorn process per instance: fewer concurrent
#                         streams per process, more instances under load
set -euo pipefail
# Git Bash on Windows rewrites "/health/startup" into "C:/Program Files/Git/health/startup"
# in arguments; exclude that argument from the conversion (no-op elsewhere).
export MSYS2_ARG_CONV_EXCL="--startup-probe"

SERVICE="${SERVICE:-syd-brain}"
REGION="${REGION:-europe-west1}"

cmd=(gcloud run services update "$SERVICE"
  --region="$REGION"
  --min-instances=0
  --max-instances=20
  --cpu=1
  --memory=1Gi
  --cpu-boost
  --concurrency=40
  --timeout=300
  --session-affinity
  "--startup-probe=httpGet.path=/health/startup,periodSeconds=1,timeoutSeconds=1,failureThreshold=90"
  --quiet)

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  printf '%q ' "${cmd[@]}"; echo
else
  "${cmd[@]}"
fi
