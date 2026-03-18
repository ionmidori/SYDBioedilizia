# 🏗️ SYD Bioedilizia - AI-Driven Renovation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.130-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![ADK](https://img.shields.io/badge/AI_Orchestration-Google_ADK-blue)](https://cloud.google.com/vertex-ai)
[![Firebase](https://img.shields.io/badge/Security-App_Check_Strict-FFCA28?logo=firebase)](https://firebase.google.com/docs/app-check)
[![Model](https://img.shields.io/badge/AI-Gemini_2.5_Flash-darkblue)](https://deepmind.google/technologies/gemini/)

**SYD Bioedilizia** is a high-performance, enterprise-grade Hybrid Cloud platform designed to revolutionize the construction industry. By blending state-of-the-art **Generative AI (Gemini 2.5 Flash & 3.0 Pro)** with a rigid **3-Tier Architecture** and **Human-in-the-Loop (HITL)** orchestration via **Google ADK**, it provides a seamless, secure, and intelligent renovation experience.

---

## 🏛️ Architectural Integrity: The "3-Tier Law"

The platform is built on a strict separation of concerns to ensure institutional-grade stability and security.

### Tier 1: Directives (Strategy & Governance)
- **Engine**: Google ADK (Vertex AI Agent Builder) Multi-Agent Orchestration with active Session Persistence Hardening.
- **Security**: **Sandwich Defense** implementation with active delimiter neutralization against Prompt Injection (OWASP LLM01).
- **Logic**: `syd_orchestrator` dynamically routes to specialized sub-agents (`triage`, `design`, `quote`) with Intent-First processing.
- **Context**: Dynamic context building via RAG-lite patterns and Vertex AI Session Services.
- **Evaluation**: Integrated ADK Evaluation Suite with dynamic offline rubrics.

### Tier 2: Orchestration (UI & Interaction Layer)
- **Framework**: Next.js 16.2 (App Router) + React 19 compatible (Turbopack hardened).
- **Validation**: Runtime data integrity enforced via **Zod-based `fetchValidated` wrappers**, eliminating unsafe type assertions.
- **State**: SWR (Server) + Zustand (UI) + URL-driven persistence.
- **Logic**: Vercel AI SDK integration for resilient, streaming AI responses with real-time UI features like the Video Trimmer and interactive media carousels.

### Tier 3: Execution (Data & Logic Muscle)
- **API**: FastAPI (Python 3.13+) with high-concurrency **Raw ASGI middleware** stack and native unstructured payload routing.
- **Async Hygiene**: Firestore persistence offloaded to **FastAPI `BackgroundTasks`**, ensuring ultra-low TTFT (Time To First Token).
- **Resource Protection**: Enforced **5MB file limits** and multimodal caps (5 images/2 videos) to prevent OOM and Denial of Wallet.
- **Engines**: Vision & CAD (ezdxf), Market Intelligence (Perplexity), Visual Assets (Imagen 3).
- **Feedback Loop**: Negative feedback collection and self-correction architecture.

---

## 🛡️ Enterprise-Grade Security & Trust

- **Identity**: Firebase Auth with **WebAuthn/Passkey** integration and real-time biometric enrollment tracking.
- **Anti-Abuse**: **Firebase App Check Strict Mode Enforcement** coupled with dynamic **Nonce-based Content Security Policy (CSP)**.
- **Data Integrity**: **"Golden Sync"** pattern with Pydantic V2 `extra="forbid"` and TypeScript `z.infer` for 1:1 schema parity.
- **Network Hardening**: Strict JWT `aud` (Audience) claim verification and asymmetric RSA validation.
- **Persistence**: Sealed "Zero-Trust" Firebase Storage rules for renders and user uploads.

---

## 📋 Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16.2, Tailwind CSS 4, Framer Motion 12, SWR, Zod |
| **Backend** | Python 3.13, FastAPI 0.130, Pydantic V2 (Strict Mode), `uv` |
| **AI - Reasoning** | **Gemini 2.5 Flash** (Default), **Google ADK**, **Perplexity Sonar** |
| **AI - Vision** | Gemini 1.5 Pro (CAD/Vectorization), Imagen 3 (Rendering), `ezdxf` |
| **Cloud/Infra** | GCP (Cloud Run, Cloud Logging), Firebase (Auth, Firestore, App Check) |
| **Security** | Nonce-based CSP, HSTS, Asymmetric JWT, BackgroundTasks Hygiene |

---

## ✨ Key Capabilities

1.  **AI Architect**: Proactive agent that guides users through technical quotes and photo-realistic architectural renders.
2.  **Automated CAD Digitization**: Instantly converts photos of floorplans into editable layered DXF files.
3.  **Real-Time Market Intelligence**: Scans live market data to provide accurate, geo-localized price estimates.
4.  **HITL Admin Approval**: Robust backend pipeline for PDF generation (WeasyPrint) and n8n-driven delivery.
5.  **Universal Mobile Engine**: Custom gesture engine providing a 60fps "swipe" experience on touch devices.
6.  **Batch Quote Aggregation**: Rule-based engine calculating multi-project cross-optimizations (deduplication, shared overhead).
7.  **Enterprise Security**: Google Cloud Model Armor integrated for Prompt Injection and Data Leak prevention.

---

## 🚀 Deployment & Operations

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
- **Verification**: `npm run type-check` (0 Errors) & `uv run pytest` (Passing **400+** unit and evaluation tests).
- **Hardening**: Production-ready Docker builds with pre-compressed assets and security headers.

---

## 🤝 Project Leadership
**SYD Bioedilizia** - *Engineering the future of sustainable living through AI.*

---
*© 2026 SYD Bioedilizia. All rights reserved. Professional Grade Software.*
