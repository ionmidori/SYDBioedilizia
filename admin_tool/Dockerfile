FROM python:3.12-slim

WORKDIR /app

# System deps for compiled packages
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application files (no .env, no firebase-service-account.json)
COPY app.py .
COPY config.yaml .
COPY pages/ pages/
COPY src/ src/
COPY .streamlit/ .streamlit/

# Non-root user
RUN useradd -m -u 1000 streamlit && chown -R streamlit:streamlit /app
USER streamlit

# Cloud Run requires port 8080
EXPOSE 8080

ENTRYPOINT ["streamlit", "run", "app.py", "--server.port=8080", "--server.address=0.0.0.0", "--server.headless=true", "--server.fileWatcherType=none", "--server.enableCORS=false", "--browser.gatherUsageStats=false"]
