#!/usr/bin/env bash
# Switch syd-brain's Gemini backend from AI Studio (API key, global) to
# Vertex AI on the EU multi-region endpoint (aiplatform.eu.rep.googleapis.com):
# prompts and responses are processed in the EU, with the service account's
# ADC credentials instead of an API key.
#
# Verified 2026-10-09 (local, ADC):
#   - europe-west1 / europe-west4 / europe-west8 do NOT serve gemini-3.5-flash-lite,
#     gemini-3.8-flash or gemini-3.1-flash-lite (404); the `eu` multi-region does.
#   - image models on `eu`: only gemini-3.1-flash-image (the GA version of the
#     preview used today on AI Studio) -> MODEL_IMAGE must change with the switch.
#   - chat bench on `eu`: same first-turn latency, better follow-up tail.
#   - runtime SA syd-brain-run already has roles/aiplatform.user.
#
# Rollout (each step is explicit):
#   bash backend_python/deploy/gemini-vertex-eu.sh stage     # new revision, 0% traffic, tag "vertex"
#   # test https://vertex---syd-brain-<hash>.europe-west1.run.app (chat + a render)
#   bash backend_python/deploy/gemini-vertex-eu.sh promote   # 100% traffic to it
#   bash backend_python/deploy/gemini-vertex-eu.sh rollback  # back to the previous revision
#
# After a few days on Vertex: remove GEMINI_API_KEY from the service and
# disable the AI Studio key (`gcloud run services update syd-brain
# --remove-env-vars=GEMINI_API_KEY`, then revoke it in AI Studio).
#
# ⚠️ 2026-10-14: the AI Studio key has been REVOKED. `rollback` targets an
# AI Studio revision (syd-brain-00581-hdv) and would take the whole chat down:
# do not use it. Roll back to an earlier Vertex revision instead.
set -euo pipefail

SERVICE="${SERVICE:-syd-brain}"
REGION="${REGION:-europe-west1}"
PROJECT="${PROJECT:-chatbotluca-a8a73}"
STATE_FILE="${STATE_FILE:-$(dirname "$0")/.vertex-previous-revision}"

case "${1:-}" in
  stage)
    previous=$(gcloud run services describe "$SERVICE" --region="$REGION" \
      --format='value(status.traffic[0].revisionName)')
    echo "$previous" > "$STATE_FILE"
    echo "Current serving revision: $previous (saved for rollback)"
    gcloud run services update "$SERVICE" --region="$REGION" \
      --update-env-vars="GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=eu,MODEL_IMAGE=gemini-3.1-flash-image,MODEL_VALIDATION_STRICT=true" \
      --tag=vertex --no-traffic --quiet
    gcloud run services describe "$SERVICE" --region="$REGION" \
      --format='value(status.traffic[].url)' | tr ';' '\n' | grep -i vertex || true
    ;;
  promote)
    gcloud run services update-traffic "$SERVICE" --region="$REGION" --to-latest --quiet
    ;;
  rollback)
    if [[ "${FORCE_AI_STUDIO_ROLLBACK:-}" != "1" ]]; then
      echo "Refusing: the previous revision runs on AI Studio and its key is revoked." >&2
      echo "Set FORCE_AI_STUDIO_ROLLBACK=1 only after configuring a new key." >&2
      exit 1
    fi
    previous=$(cat "$STATE_FILE")
    gcloud run services update-traffic "$SERVICE" --region="$REGION" \
      --to-revisions="$previous=100" --quiet
    ;;
  *)
    echo "usage: $0 stage|promote|rollback" >&2
    exit 2
    ;;
esac
