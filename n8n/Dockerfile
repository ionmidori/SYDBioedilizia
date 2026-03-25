# n8n on Cloud Run
# Uses the official n8n image. Cloud Run injects PORT=8080 automatically.
# n8n >= 0.235 respects the PORT env var natively.
FROM docker.n8n.io/n8nio/n8n:latest

# Cloud Run requires the container to listen on $PORT (default 8080)
ENV N8N_PORT=8080

# Required for Cloud Run: no persistent worker processes
ENV EXECUTIONS_PROCESS=main

# Required for Cloud Run: SSE instead of WebSocket for push events
ENV N8N_PUSH_BACKEND=sse

# Disable telemetry
ENV N8N_DIAGNOSTICS_ENABLED=false
ENV N8N_VERSION_NOTIFICATIONS_ENABLED=false
