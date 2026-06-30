# 🏗️ SYD Bioedilizia - AI-Driven Renovation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.138-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![ADK](https://img.shields.io/badge/Google_ADK-2.3-blue?logo=google-cloud)](https://google.github.io/adk-docs/)
[![Firebase](https://img.shields.io/badge/Security-App_Check_Strict-FFCA28?logo=firebase)](https://firebase.google.com/docs/app-check)
[![Model](https://img.shields.io/badge/AI-Gemini_3.1_Flash_Lite-darkblue)](https://deepmind.google/technologies/gemini/)
[![Model Armor](https://img.shields.io/badge/Model_Armor-Verified_✅-green?logo=google-cloud)](https://cloud.google.com/security/products/model-armor)

**SYD Bioedilizia** is a high-performance, enterprise-grade Hybrid Cloud platform designed to revolutionize the construction industry. By blending state-of-the-art **Generative AI (Gemini 3.1 Flash Lite)** with a rigid **3-Tier Architecture** and **Human-in-the-Loop (HITL)** orchestration via **Google ADK 2.x**, it provides a seamless, secure, and intelligent renovation experience.

---

## 🏛️ Architectural Integrity: The "3-Tier Law"

The platform is built on a strict separation of concerns to ensure institutional-grade stability and security.

### Tier 1: Directives (Strategy & Governance)
- **Engine**: Google ADK 2.x Multi-Agent Orchestration with active Session Persistence Hardening.
- **Security**: **Sandwich Defense** implementation with active delimiter neutralization against Prompt Injection (OWASP LLM01).
- **Guardrails**: **Google Cloud Model Armor** integrated as `before_model_callback` / `after_model_callback` on the root orchestrator — scans both user input and model output in real-time.
- **Logic**: `syd_orchestrator` dynamically routes to specialized sub-agents (`triage`, `design`, `quote`) with Intent-First processing.
- **Context**: Dynamic context building via **Native RAG (Pinecone Serverless)** with Integrated Inference (`multilingual-e5-large`).
- **Evaluation**: Integrated ADK Evaluation Suite with dynamic offline rubrics.

### Tier 2: Orchestration (UI & Interaction Layer)
- **Framework**: Next.js 16.2 (App Router) + React 19 (Turbopack hardened).
- **Validation**: Runtime data integrity enforced via **Zod-based `fetchValidated` wrappers**, eliminating unsafe type assertions.
- **State**: SWR (Server) + Zustand (UI) + URL-driven persistence.
- **Logic**: Vercel AI SDK v6 integration for resilient, streaming AI responses with real-time UI features like the Video Trimmer and interactive media carousels.

### Tier 3: Execution (Data & Logic Muscle)
- **API**: FastAPI 0.138 (Python ≥3.12) with high-concurrency **Raw ASGI middleware** stack and native unstructured payload routing.
- **Async Hygiene**: Firestore persistence offloaded to **FastAPI `BackgroundTasks`**, ensuring ultra-low TTFT (Time To First Token).
- **Resource Protection**: Enforced **5MB file limits** and multimodal caps (5 images/2 videos) to prevent OOM and Denial of Wallet.
- **Engines**: Vision & CAD (ezdxf), Market Intelligence (Perplexity), Visual Assets (Gemini 3.1 Flash Image), **RAG Engine** (Pinecone).
- **Feedback Loop**: Negative feedback collection and self-correction architecture.

---

## 🛡️ Enterprise-Grade Security & Trust

- **LLM Guardrails**: **Google Cloud Model Armor** — Template `syd-guardrail-v1` in `europe-west1` with 7 active filters: RAI (Hate Speech, Dangerous, Sexually Explicit, Harassment), SDP (Sensitive Data Protection), Prompt Injection & Jailbreak Detection, Malicious URI Detection + CSAM (always-on). Multi-language detection enabled for Italian input. Audit trail active on Cloud Logging.
- **Identity**: Firebase Auth with **WebAuthn/Passkey** integration and real-time biometric enrollment tracking.
- **Anti-Abuse**: **Firebase App Check Strict Mode Enforcement** coupled with dynamic **Nonce-based Content Security Policy (CSP)**.
- **Data Integrity**: **"Golden Sync"** pattern with Pydantic V2 `extra="forbid"` and TypeScript `z.infer` for 1:1 schema parity.
- **Network Hardening**: Strict JWT `aud` (Audience) claim verification and asymmetric RSA validation.
- **Persistence**: Sealed "Zero-Trust" Firebase Storage rules for renders and user uploads.
- **Webhook Security**: HMAC-SHA256 signed webhooks with vendor-neutral headers (`X-SYD-Timestamp` / `X-SYD-Signature`).

---

## 📋 Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16.2.6, React 19.2, Tailwind CSS 4, Framer Motion 12, SWR, Zod 4, TypeScript 6 |
| **Backend** | Python ≥3.12, FastAPI 0.138, Pydantic V2 (Strict Mode), Starlette 1.3, `uv` |
| **AI — Reasoning** | **Gemini 3.1 Flash Lite** (Default Chat/Agents), **Google ADK 2.3**, **Perplexity Sonar** |
| **AI — RAG** | **Pinecone Serverless**, Integrated Inference (`multilingual-e5-large`), 2,859 vectors |
| **AI — Vision** | Gemini 3.1 Flash Lite (CAD/Vectorization), Gemini 3.1 Flash Image (Rendering), `ezdxf` |
| **AI — Security** | **Google Cloud Model Armor** (7 filters + CSAM), fail-open with audit trail |
| **Cloud/Infra** | GCP (Cloud Run, Cloud Logging, Cloud Build), Firebase (Auth, Firestore, App Check, Storage) |
| **Security** | Model Armor, Nonce-based CSP, HSTS, Asymmetric JWT, HMAC-SHA256 Webhooks |
| **Automation** | n8n (4 workflows), Gmail SMTP, Supabase RLS |

---

## ✨ Key Capabilities

1.  **AI Architect**: Proactive agent that guides users through technical quotes and photo-realistic architectural renders.
2.  **Native RAG System**: Specialized knowledge retrieval using Pinecone Serverless, providing zero-latency access to the official **Lazio Regional Pricing List 2023** (2,859 articles across 51 categories).
3.  **Automated CAD Digitization**: Instantly converts photos of floorplans into editable layered DXF files.
4.  **Real-Time Market Intelligence**: Scans live market data to provide accurate, geo-localized price estimates.
5.  **HITL Admin Approval**: Robust backend pipeline for PDF generation (ReportLab Platypus) and n8n-driven delivery.
6.  **Universal Mobile Engine**: Custom gesture engine providing a 60fps "swipe" experience on touch devices.
7.  **Batch Quote Aggregation**: Rule-based engine calculating multi-project cross-optimizations (deduplication, shared overhead).
8.  **Live ADK Evaluation**: Integrated Google ADK `AgentEvaluator` with SYD-specific rubrics for continuous agent quality validation.
9.  **LLM Security Guardrails**: Google Cloud Model Armor integrated for Prompt Injection, Data Leak, and CSAM prevention with real-time input/output sanitization.

---

## 🚀 Deployment & Operations

### Live Services

| Service | Region | URL |
| :--- | :--- | :--- |
| **Backend (syd-brain)** | `europe-west1` | Cloud Run (revision `syd-brain-00253-xch`) |
| **Admin Console** | `europe-west1` | https://syd-admin-972229558318.europe-west1.run.app |
| **n8n Workflows** | `europe-west1` | Cloud Run (4 workflows active) |

### Local Development
The project uses **npm workspaces** for integrated management:
```bash
# 1. Install dependencies
npm install

# 2. Start services
npm run dev:web        # Frontend (Port 3000)
npm run dev:py         # Backend (Port 8081)
```

### Quality Assurance
- **Backend Tests**: `uv run pytest` — **431** unit tests passing ✅ (ADK 2.x compatible).
- **Type Safety**: `npm run type-check` — 0 errors ✅.
- **Security Audit**: `npm audit` — 0 vulnerabilities ✅. Dependabot — 0 alerts ✅.
- **Live Agent Evaluation**: Run `npm run eval:run` (requires `GOOGLE_API_KEY`) to launch ADK evaluation suite against 5 test cases across 3 agent flows (quote, triage, design). See [backend_python/tests/README.md](backend_python/tests/README.md) for details.
- **Hardening**: Production-ready Docker builds with pre-compressed assets and security headers.

---

## 🤝 Project Leadership
**SYD Bioedilizia** - *Engineering the future of sustainable living through AI.*

---
*© 2026 SYD Bioedilizia. All rights reserved. Version: v4.4.6 | Updated: June 29, 2026*
