# 🎨 SYD Bioedilizia (Web Client)

**Status:** Production-Ready (v4.0.28)
**Vision:** Luxury Tech Renovation Platform
**Stack:** Next.js 16.2, Tailwind CSS 4, Framer Motion 12, SWR

---

## 💎 The "Luxury Tech" Experience

This is not just a renovation website; it is a high-fidelity **Progressive Web App (PWA)** designed to feel like a native application.
It combines the solidity of traditional craftsmanship with the fluidity of modern interface design.

### Key UX Pillars
*   **Golden Glassmorphism:** A custom design system (M3 Expressive) blending deep "Luxury Black" backgrounds with "Gold" accents (`#E9C46A`).
*   **Elastic Physics:** All interactions (modals, swipes, buttons) use `framer-motion` springs for a tactile, organic feel.
*   **Adaptive Navigation**:
    - **Radix UI Sheet**: Accessible, focus-trapped side drawer for main navigation.
    - **Vaul Drawer**: Native-feeling Bottom Sheets for action-oriented dialogs (Creation, Authentication, Video Trimmer).
*   **Mobile-First Engine**: A custom-engineered **Swipe Navigation System** (60fps) mimicking native gestures.

---

## 🛠️ Technology Stack

| Component | Technology | Version | Role |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 16.2 | Server Components, SEO, Managed Routing, Turbopack |
| **Styling** | Tailwind CSS | 4.0 | Enterprise Design System, Modern CSS |
| **Animation** | Framer Motion | 12.23 | Gesture-driven UI, Fluid Transitions |
| **Data Fetching** | SWR | 2.x | Efficient Server-State synchronization |
| **AI Streaming** | Vercel AI SDK | 3.x | Real-time "Google ADK" integration via `/chat/stream` |
| **Auth** | Firebase Auth | 13.x | Zero-Trust (Passkey + JWT + App Check) |
| **Validation** | Zod | 4.3 | Runtime schema validation (Golden Sync) |

---

## 🚀 Core Features

### 1. The Reasoning Engine (Chat)
*   **UI:** `ThinkingIndicator` pulses while the backend plans. `ReasoningStepView` reveals internal logic card-by-card.
*   **Feedback Loop:** In-line feedback mechanism (👍/👎) directly integrated into assistant message items for ADK offline evaluation.
*   **Standard:** Full compliance with Vercel AI Data Stream Protocol.

### 2. Rich Media Handling
*   **Video Trimmer:** Built-in modal logic for trimming videos before upload to save bandwidth and compute time.
*   **Media Carousel:** Dynamic "Recent Media" Bento grid section showcasing generated floorplans and renders.

### 3. Batch Operations & Management
*   **BatchSubmitModal**: Multi-step flow for reviewing, confirming, and submitting multiple projects for batch quoting.
*   **FloatingBatchBar**: Sticky selection interface for cross-project bulk actions.

### 4. Hybrid Authentication
*   **Biometric (Passkey):** Native login with FaceID/TouchID (WebAuthn).
*   **Zero-Trust:** Every request includes a Firebase App Check token (ReCAPTCHA Enterprise).
*   **Compliance:** All forms migrated to **React Hook Form + Zod** validation.

### 5. The "Golden Sync"
*   Backend Pydantic Models are mirrored 1:1 in TypeScript Interfaces (`types/`).
*   **Zero-Drift Policy:** Strict type safety enforced from database to view.

---

## 📦 Project Structure

```bash
web_client/
├── app/                  # Next.js App Router (RSC by default)
│   ├── api/chat/         # Streaming Proxy
│   ├── auth/             # Biometric & Magic Link Auth
│   └── dashboard/        # BENTO Grid Hub
├── components/
│   ├── chat/             # AI Interaction Layer & Feedback UI
│   ├── mobile/           # SwipeGestureEngine (60fps)
│   ├── ui/               # Primary Primitives (Sheet, Drawer, Form)
│   └── providers/        # Auth, QueryClient, Chat Contexts
├── hooks/                # useAuth, useProjects, useMediaQuery
├── lib/                  # Modern Firebase, Haptics, API Clients
├── types/                # Golden Sync (Zod + Interfaces)
└── public/               # Static High-Res Assets
```

---

## 🛠️ Setup & Development

### Installation
```bash
cd web_client
npm install
```

### Commands
```bash
# Start Dev Server (Port 3000)
npm run dev

# Type Check (Zero Tolerance)
npm run type-check

# Run Tests (Jest + RTL)
npm test

# Build for Production (Turbopack)
npm run build
```

---

_Updated: March 18, 2026 — Phase 74 (v4.0.28)_

