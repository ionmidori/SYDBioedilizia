#!/bin/bash
set -e

echo "🚀 [Entrypoint] Starting Cloud Run Container..."

# echo "🔎 [Entrypoint] Checking python environment..."
# python check_imports.py

echo "🔥 [Entrypoint] Starting Uvicorn on port ${PORT:-8080}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --log-level info
