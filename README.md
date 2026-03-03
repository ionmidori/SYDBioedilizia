# 🏗️ SYD Bioedilizia - AI-Driven Renovation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.130-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![ADK](https://img.shields.io/badge/AI_Orchestration-Google_ADK-blue)](https://cloud.google.com/vertex-ai)
[![Firebase](https://img.shields.io/badge/Security-App_Check-FFCA28?logo=firebase)](https://firebase.google.com/docs/app-check)
[![Model](https://img.shields.io/badge/AI-Gemini_2.5_Flash-darkblue)](https://deepmind.google/technologies/gemini/)

**SYD Bioedilizia** is a high-performance, enterprise-grade Hybrid Cloud platform designed to revolutionize the construction industry. By blending state-of-the-art **Generative AI (Gemini 2.5 Flash & 1.5 Pro)** with a rigid **3-Tier Architecture** and **Human-in-the-Loop (HITL)** orchestration via **Google ADK**, it provides a seamless, secure, and intelligent renovation experience.

---

## 🏛️ Architectural Integrity: The "3-Tier Law"

The platform is built on a strict separation of concerns to ensure institutional-grade stability and security.

### Tier 1: Directives (Strategy & Governance)
- **Engine**: Google ADK (Vertex AI Agent Builder) Multi-Agent Orchestration.
- **Logic**: `syd_orchestrator` dynamically routes to specialized sub-agents (`triage`, `design`, `quote`).
- **Context**: Dynamic context building via RAG-lite patterns and Vertex AI Session Services.

### Tier 2: Orchestration (UI & Interaction Layer)
- **Framework**: Next.js 16.2 (App Router) + React 19 (RC) compatible.
- **Accessibility**: Standardized on **Radix UI Sheet** for navigation and **Vaul** for action drawers.
- **State**: SWR (Server) + Zustand (UI) + URL-driven persistence.
- **Logic**: Vercel AI SDK integration for resilient, streaming AI responses.

### Tier 3: Execution (Data & Logic Muscle)
- **API**: FastAPI (Python 3.12+) with high-concurrency async support.
- **Workflows**: Multi-turn, stateful AI interactions with Firestore persistence and strict HITL patterns.
- **Specialized Engines**:
  - **Vision & CAD**: Automated conversion of raster floorplans to **DXF (AutoCAD R2010)** using Gemini 1.5 Pro + `ezdxf`.
  - **Market Intelligence**: Real-time price analysis using **Perplexity Sonar** for up-to-date material costs.
  - **Visual Assets**: Photo-realistic rendering via **Imagen 3**.
  - **Automation Hub**: **n8n MCP Integration** for professional document delivery (PDF), admin notifications (Telegram/Email), and CRM synchronization.

---

## 🛡️ Enterprise-Grade Security & Trust

- **Identity**: Firebase Auth with WebAuthn/Passkey integration (Biometric login).
- **Anti-Abuse**: End-to-end **Firebase App Check Enforcement** with reCAPTCHA Enterprise.
- **Data Integrity**: **"Golden Sync"** pattern ensures 1:1 mathematical alignment between Pydantic (Backend) and TypeScript (Frontend).
- **Human-in-the-Loop (HITL)**: Enterprise quote approval pipeline with Firestore-backed checkpoints.
- **Compliance**: All forms migrated to **React Hook Form + Zod** with server-side parity.

---

## 📋 Technology Matrix

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16.2, Tailwind CSS 4, Framer Motion 12, SWR |
| **Backend** | Python 3.12+, FastAPI 0.130, Pydantic V2, `uv` Package Manager |
| **AI - Reasoning** | **Gemini 2.5 Flash** (Default), **Google ADK**, **Perplexity Sonar** (Market Data) |
| **AI - Vision** | Gemini 1.5 Pro (CAD/Vectorization), Imagen 3 (Rendering), `ezdxf` |
| **Cloud/Infra** | GCP (Cloud Run, Cloud Logging), Firebase (Auth, Firestore, App Check) |
| **Performance** | MotionValue-based Swipe Engine (60fps), Standalone Docker Builds |

---

## ✨ Key Capabilities

1.  **AI Architect**: Proactive agent that guides users through technical quotes and photo-realistic architectural renders.
2.  **Automated CAD Digitization**: Instantly converts photos of floorplans into editable layered DXF files.
3.  **Real-Time Market Intelligence**: Scans live market data to provide accurate, geo-localized price estimates.
4.  **HITL Admin Approval**: Robust backend pipeline for PDF generation (WeasyPrint) and n8n-driven delivery.
5.  **Universal Mobile Engine**: Custom gesture engine providing a desktop-class "swipe" experience on touch devices.

---

## 🚀 Deployment & Operations

### Local Development
The project uses **npm workspaces** for integrated management:
```bash
# 1. Install dependencies
npm install

# 2. Start services
npm run dev:web        # Frontend
npm run dev:py         # Backend
```

### Quality Assurance
- **Verification**: `npm run type-check` & `uv run pytest` (Passing **172** unit/integration tests).
- **Environment**: Strict `pydantic-settings` validation.
- **Infrastructure**: Standalone Docker output enabled.

---

## 🤝 Project Leadership
**SYD Bioedilizia** - *Engineering the future of sustainable living through AI.*

---
*© 2026 SYD Bioedilizia. All rights reserved. Professional Grade Software.*
