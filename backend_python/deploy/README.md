# Deploy and operations scripts

This folder holds the scripts that configure the `syd-brain` Cloud Run service
and the Google Cloud resources around it. They're the source of truth for that
configuration: a value changed in the console and not here will drift. Each
script is idempotent and starts with a header that explains what it does, so
read the header before you run it.

Run them from the repository root with `gcloud` authenticated on the
`chatbotluca-a8a73` project. Unless noted, the service is `syd-brain` in
`europe-west1`.

## How a release reaches production

A push to `main` starts a Cloud Build trigger that builds the image from
`backend_python/Dockerfile` and runs `gcloud run services update --image=...`.
That command keeps every other setting of the service, so the runtime
configuration below is applied by these scripts and not by the pipeline.

The frontend deploys separately on Vercel.

## Scripts

| Script | Purpose |
| :--- | :--- |
| `cloud-run-config.sh` | Runtime settings of the service: scale to zero, 1 GiB memory, startup CPU boost, startup probe on `/health/startup`, session affinity, concurrency 40. `DRY_RUN=1` prints the command. |
| `email-outbox.sh` | Infrastructure of the email outbox: Firestore indexes, Cloud Tasks queue, the invoker service account and its IAM, the environment variables, and the Brevo secrets. Subcommands: `indexes`, `tasks`, `sweep`, `status`, `brevo`. |
| `gemini-vertex-eu.sh` | Switches Gemini from AI Studio to Vertex AI on the `eu` multi-region. Subcommands: `stage`, `promote`, `rollback`. |
| `observability/apply.sh` | Log-based metrics and alert policies: chat latency (`chat_ttft_ms`, `chat_total_ms`, `chat_llm_ms`, `chat_queued_ms`) with the "Chat TTFT p95 > 3s" alert, and `email_dead_letter` with the "Email dead-letter" alert. |

> **Warning:** `gemini-vertex-eu.sh rollback` returns to the revision saved by
> `stage`. The AI Studio key was revoked on October 14, 2026, so a rollback to
> an AI Studio revision takes the whole chat down. Roll back to an earlier
> Vertex revision instead.

## Observability

`observability/` contains one YAML file per log-based metric and per alert
policy, and `apply.sh` applies them all:

```bash
NOTIFICATION_CHANNEL=projects/<project>/notificationChannels/<id> \
  bash backend_python/deploy/observability/apply.sh
```

List the channels with
`gcloud beta monitoring channels list --format="value(name,displayName)"`.

Metrics are created or updated on every run. A policy is created only if no
policy has the same display name, and the notification channel is attached only
to the policies the run creates; edit the channels of an existing policy in the
console. A new metric can take a minute to become visible to Monitoring, so the
script retries the policy creation a few times.

The metrics read structured log lines from the `syd-brain` revisions:

- `chat_turn_timing`, emitted for every chat turn (`src/core/chat_timing.py`).
- `email_dead_letter`, emitted once when an outbox email is abandoned after
  `EMAIL_MAX_ATTEMPTS` attempts or a permanent provider error
  (`src/services/email/outbox.py`). The alert fires within about five minutes
  and then stays open until 30 minutes pass without a new dead-letter, so later
  failures in that window don't send another email. The logs list all of them:
  filter on `jsonPayload.event="email_dead_letter"`.

To test the dead-letter alert, either wait for a real dead-letter or force one
in a staging revision, for example with `EMAIL_MAX_ATTEMPTS=1` and an
unreachable SMTP host. Then check that the email arrives and that Logs
Explorer returns the line for the `syd-brain` service.

## Next steps

- Backend overview: [`../README.md`](../README.md)
- Manual maintenance scripts: [`../scripts/README.md`](../scripts/README.md)
