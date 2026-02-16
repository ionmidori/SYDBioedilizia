# gemini.md

This file provides guidance to Gemini (Antigravity) when working with code in this repository. It serves as a mirroring reference to `CLAUDE.md` and incorporates the historical memory from the Security Audit Phase (Feb 15-16).

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

**Security Hardening (Feb 15-16)**:
- JWT verification via `src/auth/jwt_handler.py` (check_revoked=True)
- Firebase App Check enforced on all routes except `/health`
- CORS whitelist strictly enforced for Vercel domains
- Content-Security-Policy (CSP) refined to exclude `'unsafe-inline'`

### Firebase Schema ("Golden Sync")

**MUST maintain 1:1 parity** between Pydantic (Python) and TypeScript interfaces.

**Collections**:
- `users/{uid}`: User metadata, quota limits
- `projects/{projectId}`: Project state, images, renders
- `chat_history/{sessionId}`: Message history with pagination
- `leads/{leadId}`: Sales funnel submissions

**Firestore Rules**: Ownership-based security on `userId` field (all writes require auth).

### Testing Strategy

#### Frontend Testing (Jest + React Testing Library)
- **Setup**: `jest.setup.js` mocks ALL Firebase SDK modules
- **Pattern**: Mock `firebase/app`, `firebase/auth`, `firebase/firestore`, `firebase/storage`, `firebase/app-check`
- **Coverage Target**: 70%

#### Backend Testing (Pytest)
- **Config**: `pyproject.toml` defines markers (`integration` for live API tests)
- **Async**: `asyncio_mode = "auto"`
- **Mocking**: Use `pytest-mock` for Firebase Admin SDK

### Mobile UX Architecture

**Custom Swipe Engine** (60fps):
- Built with Framer Motion `MotionValue` + `useMotionValueEvent`
- 3-pane layout: Dashboard, Gallery, Chat
- Notch draggable element (48x48px touch target)

### AI Capabilities & Tools

**Vision & CAD**:
- `tools/generate_render.py`: Gemini 1.5 Pro → Imagen 3 photo-realistic renders
- `tools/gallery.py`: DXF vectorization from floorplans

**Market Intelligence**:
- `tools/market_prices.py`: Perplexity Sonar API for material pricing

**Quota System**:
- `tools/quota.py`: Atomic Firestore `Increment()` per user

### Environment Variables

**Frontend** (.env.local in web_client/):
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
...
NEXT_PUBLIC_ENABLE_APP_CHECK=true
```

**Backend** (.env in backend_python/):
```
GOOGLE_CLOUD_PROJECT=
FIREBASE_ADMIN_SDK_PATH=
PERPLEXITY_API_KEY=
...
```

## Code Patterns & Conventions

### Mandatory Skill Consultancy
- **CRITICAL**: Prima di iniziare qualsiasi task tecnico, architettonico o di debugging, **DEVI** consultare la directory `skills/` per verificare la presenza di pattern o workflow enterprise già definiti.

### TypeScript/React
- **Server Components by default** (App Router)
- **Modern Firebase SDK**: Always use modular v9+
- **Error Boundaries**: Hierarchical boundaries (`error.tsx`)

### Python/FastAPI
- **Pydantic V2**: Use `model_dump()`, strictly typed schemas
- **Logging**: Structured logger from `core/logger.py` with Request ID
- **Error Handling**: Raise `AppException` (from `core/exceptions.py`)

### Styling (Tailwind 4 + M3 Expressive)
- **Design System**: Material Design 3 Expressive + Glassmorphism
- **Motion**: Use `lib/m3-motion.ts` variants

## Common Pitfalls

1. **Firebase in Tests**: ALWAYS mock in `jest.setup.js`
2. **Type-check Before Commit**: `npm run type-check` must show 0 errors
3. **State Sync**: Update Pydantic models and TS interfaces concurrently (Golden Sync)
4. **Tier Violations**: Never mix Tier 2 (Client) and Tier 3 (Execution) dependencies
5. **Memory Leaks**: Maintain windowed LangGraph memory (max 5 turns)

## Support Resources

- **README.md**: High-level overview
- **PROJECT_CONTEXT_SUMMARY.md**: Historical memory and critical bug fixes
- **CLAUDE.md**: Parallel guidance for Claude Agent
