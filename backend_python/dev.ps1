# Development server script with hot-reload
# Usage: .\dev.ps1

Write-Host "🐍 Starting SYD Backend Development Server..." -ForegroundColor Cyan
Write-Host "📍 Port: 8080" -ForegroundColor Yellow
Write-Host "🔄 Hot-reload: Enabled" -ForegroundColor Green
Write-Host ""

# Run uvicorn with reload flag via uv
c:\Users\User01\.local\bin\uv.exe run uvicorn main:app --host 0.0.0.0 --port 8080 --reload --log-level info
