# 🏗️ SYD Bioedilizia - AI-Driven Renovation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-16.1-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.128-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/AI_Orchestration-LangGraph-orange)](https://www.langchain.com/langgraph)
[![Firebase](https://img.shields.io/badge/Security-App_Check-FFCA28?logo=firebase)](https://firebase.google.com/docs/app-check)

**SYD Bioedilizia** is a high-performance, enterprise-grade Hybrid Cloud platform designed to revolutionize the construction industry. By blending state-of-the-art **Generative AI (Gemini 2.0 Flash & 1.5 Pro)** with a rigid **3-Tier Architecture** and **Human-in-the-Loop (HITL)** orchestration, it provides a seamless, secure, and intelligent renovation experience.

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
- **API**: FastAPI (Python 3.12+) with high-concurrency async support.
- **Workflows**: Multi-turn, stateful AI graphs via LangGraph.
- **Specialized Engines**:
  - **Vision & CAD**: Automated conversion of raster floorplans to **DXF (AutoCAD R2010)** using Gemini 1.5 Pro + `ezdxf`.
  - **Market Intelligence**: Real-time price analysis using **Perplexity Sonar** for up-to-date material costs.
  - **Visual Assets**: Photo-realistic rendering via **Imagen 3**.
  - **Automation Hub**: **n8n MCP Integration** for professional document delivery (PDF), admin notifications (Telegram/Email), and CRM synchronization.

---

## 🛡️ Enterprise-Grade Security & Trust

Security is not an afterthought but the foundation of the platform:
- **Identity**: Firebase Auth with WebAuthn/Passkey integration (Biometric login).
- **Anti-Abuse**: End-to-end **Firebase App Check** with reCAPTCHA Enterprise protection.
- **Data Integrity**: **"Golden Sync"** pattern ensures 1:1 mathematical alignment between Pydantic (Backend) and TypeScript (Frontend) schemas via automated Zod validation.
- **Human-in-the-Loop (HITL)**: Enterprise quote approval pipeline with Firestore-backed checkpoints and secure admin interrupts.
- **Resilient UI**: Hierarchical Error Boundaries and zero-trust null guards on all data mapping.

---

## 📋 Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16.1, Tailwind CSS 4, Framer Motion 12, SWR |
| **Backend** | Python 3.12+, FastAPI 0.128, Pydantic V2, `uv` Package Manager |
| **AI - Reasoning** | Vertex AI (Gemini 2.0 Flash), LangGraph, **Perplexity Sonar** (Market Data) |
| **AI - Vision** | Gemini 1.5 Pro (CAD/Vectorization), Imagen 3 (Rendering), `ezdxf` |
| **Cloud/Infra** | GCP (Cloud Run, Cloud Logging), Firebase (Auth, Firestore, App Check) |
| **Performance** | MotionValue-based Swipe Engine (60fps), Standalone Docker Builds |

---

## ✨ Key Capabilities

1.  **AI Architect**: Proactive agent that guides users through technical quotes and photo-realistic architectural renders.
2.  **Automated CAD Digitization**: Instantly converts photos of paper floorplans into editable layered DXF files for professional tools.
3.  **Real-Time Market Intelligence**: Scans live market data to provide accurate, geo-localized price estimates for materials and labor.
4.  **HITL Admin Approval**: A robust backend pipeline for PDF generation (WeasyPrint), Storage management, and n8n-driven delivery.
5.  **Universal Mobile Engine**: A custom-built gesture engine for iOS/Android that provides a desktop-class "swipe and fluid" navigation experience.

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
- **Verification**: `npm run type-check` & `uv run pytest` (Passing 170+ unit/integration tests).
- **Environment**: Strict `pydantic-settings` validation for zero-config-error deployments.
- **Infrastructure**: Standalone Docker output enabled for minimal deployment footprint.

---

## 🤝 Project Leadership
**SYD Bioedilizia** - *Engineering the future of sustainable living through AI.*

---
*© 2026 SYD Bioedilizia. All rights reserved. Professional Grade Software.*
