# 🐍 SYD Backend (Python)

> **AI Logic Backend** per il sistema di preventivi SYD Bioedilizia.

## Stack Tecnologico

- **Runtime**: Python 3.12
- **Framework**: FastAPI (async-native)
- **AI Orchestration**: LangGraph
- **Package Manager**: `uv` (ultra-veloce, Rust-based)

## Struttura Prevista

```
backend_python/
├── src/                    # Codice sorgente
│   ├── api/               # Endpoint FastAPI
│   ├── agents/            # LangGraph agents
│   ├── tools/             # AI tools (Imagen, Perplexity, etc.)
│   ├── streaming/         # Vercel AI SDK adapter
│   └── auth/              # Firebase + JWT validation
├── tests/                 # Test suite (pytest)
├── pyproject.toml         # Dipendenze (gestite da uv)
├── Dockerfile             # Container per Cloud Run
└── main.py               # Entry point
```

## Fase Corrente

✅ **Fase 0.1**: Directory structure creata.

→ **Prossimo Step**: Fase 0.2 - Inizializzazione progetto con `uv`.
