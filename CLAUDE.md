# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SYD Bioedilizia** is a full-stack AI-powered renovation platform with strict 3-Tier Architecture:
- **Tier 1 (Directives)**: LangGraph AI orchestration with specialized agents
- **Tier 2 (UI)**: Next.js 16 App Router + React 18.3 with mobile-first UX
- **Tier 3 (Execution)**: Python FastAPI backend with Gemini 2.5 Flash, Vertex AI, and Firebase

## Development Commands

### Frontend (web_client/)
```bash
# Development server (port 3000)
npm run dev:web

# Type checking (MUST show 0 errors)
cd web_client && npm run type-check

# Run tests
cd web_client && npm test

# Run single test file
cd web_client && npm test -- ChatHeader.test.tsx

# Build production
cd web_client && npm run build

# Lint + auto-fix
cd web_client && npm run lint:fix
```

### Backend (backend_python/)
```bash
# Development server (port 8080)
npm run dev:py
# OR directly:
cd backend_python && uv run uvicorn main:app --reload --port 8080

# Run tests
cd backend_python && uv run pytest

# Run single test file
cd backend_python && uv run pytest tests/test_quota.py -v

# Run with coverage
cd backend_python && uv run pytest --cov=src --cov-report=term

# Type checking (Python)
cd backend_python && uv run pyright src/
```

### Monorepo Management
This is an **npm workspace** monorepo. Always install dependencies from root:
```bash
npm install  # Installs for all workspaces
```

## Architecture Deep Dive

### 3-Tier Separation Law

**CRITICAL**: Never bypass tiers. Frontend → Backend → AI Graph is the ONLY flow.

#### Tier 1: AI Orchestration (backend_python/src/graph/)
- **Entry Point**: `backend_python/main.py` → `/chat/stream` endpoint
- **Orchestrator**: `src/services/agent_orchestrator.py` (singleton via `get_orchestrator()`)
- **State Machine**: `src/graph/state.py` defines `AgentState` with windowed memory (last 5 turns)
- **Graph Factory**: `src/graph/factory.py` builds LangGraph with dynamic tool registration
- **Tools Registry**: `src/graph/tools_registry.py` exposes Python functions as LangChain tools

**Key State Fields**:
- `phase`: "TRIAGE" | "DESIGN" | "QUOTE" - conversation stage
- `project_id`: Context-aware project binding
- `is_authenticated`: Auth gate for premium features
- `internal_plan`: Windowed list (max 5) of reasoning steps
- `thought_log`: Chain-of-thought history for debugging

**Agents**: Registered in `src/agents/sop_manager.py`, loaded as prompt templates

#### Tier 2: Frontend UI (web_client/)
- **Framework**: Next.js 16 App Router (NOT Pages Router)
- **State**: URL-driven + SWR for server state
- **Auth**: Firebase Client SDK (`lib/firebase.ts`) with `AuthProvider` context
- **Chat**: Vercel AI SDK (`@ai-sdk/react`) streams from `/chat/stream`
- **Mobile UX**: Custom MotionValue-based swipe engine in `components/mobile/MobileSwipeLayout.tsx`

**Critical Files**:
- `lib/firebase.ts`: Firebase initialization (singleton, must run before anything else)
- `app/dashboard/`: Bento Grid layout with M3 Expressive design
- `components/chat/ChatProvider.tsx`: Real-time chat state + streaming integration
- `components/mobile/MobileSwipeLayout.tsx`: 60fps swipe navigation (3-pane layout)

#### Tier 3: Backend Execution (backend_python/src/)
- **API Gateway**: `main.py` (FastAPI app)
- **Middleware Stack** (execution order):
  1. Request ID injection (`request_id_middleware`)
  2. Metrics tracking (`middleware/metrics.py`)
  3. App Check validation (`middleware/app_check.py`)
  4. Security headers (`middleware/security_headers.py`)
- **Routers**:
  - `/chat/stream`: Main streaming chat (requires auth)
  - `/api/upload`: Image/video upload to Firebase Storage
  - `/api/chat/history`: Load past conversations
  - `/api/projects`: Dashboard CRUD operations
  - `/api/passkey`: WebAuthn biometric auth

**Security**:
- JWT verification via `src/auth/jwt_handler.py`
- Firebase App Check enforced on all routes except `/health`
- CORS whitelist for Vercel deployments

### Firebase Schema ("Golden Sync")

**MUST maintain 1:1 parity** between Pydantic (Python) and TypeScript interfaces.

**Collections**:
- `users/{uid}`: User metadata, quota limits
- `projects/{projectId}`: Project state, images, renders
- `chat_history/{sessionId}`: Message history with pagination
- `leads/{leadId}`: Sales funnel submissions

**Firestore Rules**: Row-level security on `userId` field (all writes require auth)

### Testing Strategy

#### Frontend Testing (Jest + React Testing Library)
- **Setup**: `jest.setup.js` mocks ALL Firebase SDK modules (prevents real initialization)
- **Pattern**: Mock `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage`, `firebase/app-check`
- **Coverage Target**: 70% (branches, functions, lines, statements)
- **Key Principle**: Tests MUST match component implementation, not vice versa

**Example**: When a component removes "Online" status, update test expectations - don't force the component to fit old tests.

#### Backend Testing (Pytest)
- **Config**: `pyproject.toml` defines markers (`integration` for live API tests)
- **Async**: `asyncio_mode = "auto"` handles FastAPI async routes
- **Mocking**: Use `pytest-mock` for Firebase Admin SDK, Vertex AI calls
- **Coverage**: Exclude tests/, __pycache__, .venv from reports

### Mobile UX Architecture

**Custom Swipe Engine** (NOT a library):
- Built with Framer Motion `MotionValue` + `useMotionValueEvent`
- 3-pane layout: Dashboard, Gallery, Chat
- 60fps gesture tracking with spring physics
- Notch draggable UI element (48x48px touch target for WCAG)

**Files**:
- `components/mobile/MobileSwipeLayout.tsx`: Main swipe controller
- `components/mobile/ProjectMobileTabs.tsx`: Tab bar UI
- `lib/m3-motion.ts`: Motion variants for M3 Expressive design

### AI Capabilities & Tools

**Vision & CAD**:
- `tools/generate_render.py`: Gemini 1.5 Pro → Imagen 3 photo-realistic renders
- `tools/gallery.py`: DXF vectorization from raster floorplans (ezdxf library)

**Market Intelligence**:
- `tools/market_prices.py`: Perplexity Sonar API for real-time material pricing

**Quota System**:
- `tools/quota.py`: Redis-backed rate limiting per user
- Enforced via `@check_quota` decorator

### Environment Variables

**Frontend** (.env.local in web_client/):
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
NEXT_PUBLIC_ENABLE_APP_CHECK=true
```

**Backend** (.env in backend_python/):
```
GOOGLE_CLOUD_PROJECT=
FIREBASE_ADMIN_SDK_PATH=
PERPLEXITY_API_KEY=
PINECONE_API_KEY=
```

## Code Patterns & Conventions

### TypeScript/React
- Use **Server Components by default** (App Router), Client Components only when needed (`'use client'`)
- Firebase imports: **ALWAYS use modular SDK v9+** (`import { getAuth } from 'firebase/auth'`)
- Error Boundaries: Every page has hierarchical boundaries (`error.tsx`, `global-error.tsx`)
- Null safety: Use optional chaining + nullish coalescing (`user?.name ?? 'Guest'`)

### Python/FastAPI
- **Pydantic V2**: Use `model_config`, `Field(alias=...)`, `model_dump()`
- Logging: Use structured logger from `core/logger.py` (auto-injects request ID)
- Error Handling: Raise `AppException` (from `core/exceptions.py`) with error codes
- Async: Prefer `async def` for I/O operations (Firebase, Vertex AI, HTTP)

### Styling (Tailwind 4 + M3 Expressive)
- **Design System**: Material Design 3 Expressive + Glassmorphism
- **Surface Classes**: `.surface-container-low`, `.surface-container-high` (defined in `globals.css`)
- **Motion**: Use `lib/m3-motion.ts` variants for consistent animations
- **Responsive**: Mobile-first (`md:`, `lg:` breakpoints)
- **Typography**: Display Large = `text-4xl md:text-5xl lg:text-6xl`

## Deployment & CI/CD

### Frontend (Vercel)
- **Build Command**: `npm run build --workspace=web_client`
- **Output**: Standalone Docker-compatible build
- **Environment**: Production vars set in Vercel dashboard

### Backend (Google Cloud Run)
- **Entry**: `backend_python/main.py`
- **Dockerfile**: Uses `uv` for fast dependency installation
- **Health Check**: `/health` endpoint (returns `{"status": "ok"}`)
- **Scaling**: Min 0, Max 10 instances (serverless)

### Pre-commit Hooks (Husky + lint-staged)
On `git commit`:
1. ESLint auto-fix on `*.{ts,tsx}`
2. Prettier format on `*.{ts,tsx,json,md,css}`
3. Type-check NOT enforced (run manually with `npm run type-check`)

## Common Pitfalls

1. **Firebase in Tests**: ALWAYS mock in `jest.setup.js` - JSDOM cannot run real Firebase SDK
2. **Type-check Before Commit**: `npm run type-check` must show 0 errors
3. **State Sync**: When updating Pydantic models, update TypeScript interfaces (Golden Sync)
4. **Tier Violations**: Never call Vertex AI from frontend, never import React in backend
5. **Memory Leaks**: LangGraph state uses windowed memory (max 5 turns) - never infinite append
6. **Mobile Testing**: Mock `visualViewport` API for mobile component tests
7. **CORS**: Backend allows specific Vercel domains only - update `main.py` CORS list for new deployments

## File Organization

```
renovation-next/
├── web_client/                # Tier 2: Frontend
│   ├── app/                   # Next.js App Router pages
│   │   ├── dashboard/         # Bento Grid layout
│   │   └── auth/              # Login/signup flows
│   ├── components/
│   │   ├── chat/              # Chat UI + provider
│   │   ├── mobile/            # Swipe layout engine
│   │   └── dashboard/         # Dashboard widgets
│   ├── lib/
│   │   ├── firebase.ts        # Firebase singleton init
│   │   └── m3-motion.ts       # Motion design system
│   ├── jest.setup.js          # Firebase mocks
│   └── package.json
├── backend_python/            # Tier 3: Backend + Tier 1: AI
│   ├── main.py                # FastAPI entry point
│   ├── src/
│   │   ├── graph/             # LangGraph state machine
│   │   ├── agents/            # Agent prompts + SOPs
│   │   ├── tools/             # LangChain tool wrappers
│   │   ├── api/               # REST route handlers
│   │   ├── auth/              # JWT + Firebase Admin
│   │   ├── middleware/        # Request pipeline
│   │   └── core/              # Logging, exceptions, schemas
│   ├── tests/                 # Pytest suite
│   └── pyproject.toml
└── package.json               # Root npm workspace
```

## Performance Budgets

- **Frontend Build**: < 45s on Vercel
- **Type-check**: < 10s
- **Test Suite (Frontend)**: < 30s
- **Backend Cold Start**: < 3s on Cloud Run
- **Streaming Latency**: First token < 2s

## Support Resources

- **README.md**: High-level project overview + tech stack
- **Firebase Console**: https://console.firebase.google.com
- **Vercel Dashboard**: Deployment logs + analytics
- **Google Cloud Console**: Cloud Run logs + Vertex AI monitoring
