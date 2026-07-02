#!/bin/bash
# Test script to verify container can start

echo "=== Testing Container Startup ==="
echo "1. Building container..."
cd /app

echo "2. Testing Python import..."
python3 -c "import main; print('✅ Main imported successfully')" || echo "❌ Import failed"

echo "3. Starting uvicorn..."
exec /app/.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8080
