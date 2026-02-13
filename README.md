# 🏗️ SYD Bioedilizia - AI-Driven Renovation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/AI_Orchestration-LangGraph-orange)](https://www.langchain.com/langgraph)
[![Firebase](https://img.shields.io/badge/Security-App_Check-FFCA28?logo=firebase)](https://firebase.google.com/docs/app-check)

**SYD Bioedilizia** is a high-performance, enterprise-grade Hybrid Cloud platform designed to revolutionize the construction industry. By blending state-of-the-art **Generative AI (Gemini 2.5 Flash)** with a rigid **3-Tier Architecture**, it provides a seamless, secure, and intelligent renovation experience.

---

## 🏛️ Architectural Integrity: The "3-Tier Law"

The platform is built on a strict separation of concerns to ensure institutional-grade stability and security.

### Tier 1: Directives (Strategy & Governance)
- **Engine**: LangGraph Planning Nodes + Custom SOPs.
- **Logic**: Intent classification routes user requests to specialized agents.
- **Context**: Dynamic context building via RAG-lite patterns (Project Memory).

### Tier 2: Orchestration (UI & Interaction Layer)
- **Framework**: Next.js 16 (App Router) + React 18.3.
- **State**: URL-driven persistence + Real-time Firestore synchronization.
- **Logic**: Vercel AI SDK integration for resilient, streaming AI responses.

### Tier 3: Execution (Data & Logic Muscle)
- **API**: FastAPI (Python 3.11+) with high-concurrency async support.
- **Workflows**: Multi-turn, stateful AI graphs via LangGraph.
- **Assets**: Professional media processing (Imagen 3, Gemini File API for Vision).

---

## �️ Enterprise-Grade Security & Trust

Security is not an afterthought but the foundation of the platform:
- **Identity**: Firebase Auth with WebAuthn/Passkey integration (Biometric login).
- **Anti-Abuse**: End-to-end **Firebase App Check** with reCAPTCHA Enterprise protection.
- **Data Integrity**: **"Golden Sync"** pattern ensures 1:1 mathematical alignment between Pydantic (Backend) and TypeScript (Frontend) schemas.
- **Privacy**: Automated PII redaction in structured logs (`log_args=False`).
- **Resilient UI**: Hierarchical Error Boundaries and zero-trust null guards on all data mapping.

---

## 📋 Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16, Tailwind CSS 4, Framer Motion (Material 3 Expressive), SWR |
| **Backend** | Python 3.11, FastAPI, Pydantic V2, `uv` Package Manager |
| **AI/ML** | Vertex AI (Gemini 2.5 Flash, Imagen 3, Multimodal Vision), LangGraph |
| **Cloud/Infra** | GCP (Cloud Run, Cloud Logging), Firebase (Auth, Firestore, App Check) |
| **Performance** | MotionValue-based Swipe Engine (60fps), Standalone Docker Builds |

---

## ✨ Key Capabilities

1.  **AI Architect**: Proactive agent that guides users through technical quotes and photo-realistic architectural renders.
2.  **Universal Mobile Engine**: A custom-built gesture engine for iOS/Android that provides a desktop-class "swipe and fluid" navigation experience.
3.  **Real-time Collaboration**: Instant synchronization of project documents, quotes, and media across all devices using Firestore's low-latency listeners.

---

## 🚀 Deployment & Operations

### Local Development
The project uses **npm workspaces** for integrated management:
```bash
# 1. Install dependencies
npm install

# 2. Start services (requires configured .env files)
npm run dev:web        # Frontend: port 3000
npm run dev:py         # Backend: port 8080
```

### Quality Assurance (CI/CD Ready)
- **Static Analysis**: ESLint, Prettier, Pyright/MyPy.
- **Verification**: `npm run type-check` & `uv run pytest`.
- **Infrastructure**: Standalone Docker output enabled for minimal deployment footprint.

---

## 🤝 Project Leadership
**SYD Bioedilizia** - *Engineering the future of sustainable living through AI.*

---
*© 2026 SYD Bioedilizia. All rights reserved. Professional Grade Software.*
