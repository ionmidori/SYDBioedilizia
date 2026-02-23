# 🎨 SYD Bioedilizia (Web Client)

**Status:** Production-Ready (v3.5.13)
**Vision:** Luxury Tech Renovation Platform
**Stack:** Next.js 16.1, Tailwind CSS 4, Framer Motion 12

---

## 💎 The "Luxury Tech" Experience
This is not just a renovation website; it is a high-fidelity **Progressive Web App (PWA)** designed to feel like a native application.
It combines the solidity of traditional craftsmanship with the fluidity of modern interface design.

### Key UX Pillars
*   **Golden Glassmorphism:** A custom design system (M3 Expressive) blending deep "Luxury Black" backgrounds with "Gold" accents (`#E9C46A`) and frosted glass surfaces.
*   **Elastic Physics:** All interactions (modals, swipes, buttons) use `framer-motion` springs (stiffness: 400, damping: 30) for a tactile, organic feel.
*   **Mobile-First Engine:** A custom-engineered **Swipe Navigation System** (60fps) that mimics native iOS gestures, allowing users to glide between the Dashboard, Chat, and Gallery.

---

## 🛠️ Technology Stack

| Component | Technology | Version | Role |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | 16.1 | Server Components, SEO, Routing |
| **Styling** | Tailwind CSS | 4.0 | Zero-runtime styling, CSS Variables |
| **Animation** | Framer Motion | 12.23 | Gesture-driven UI, Shared Layout Animations |
| **AI Streaming** | Vercel AI SDK | 3.0 | Real-time "Reasoning Engine" integration |
| **Auth** | Firebase Auth | 12.8 | Zero-Trust (Biometric + Magic Link + JWT) |
| **Validation** | Zod | 4.3 | Runtime schema validation (Golden Sync) |

---

## 🚀 Core Features

### 1. The Reasoning Engine (Chat)
We don't just "stream text". We stream **thought processes**.
*   **UI:** `ThinkingIndicator` pulses while the backend plans. `ReasoningStepView` reveals the AI's internal logic card-by-card.
*   **Protocol:** Vercel AI Data Stream Protocol (Events: `0`=Text, `2`=Data, `9`=Tool).

### 2. Hybrid Authentication
A security fortress with a luxury onboarding experience.
*   **Biometric (Passkey):** Users can log in with FaceID/TouchID (WebAuthn).
*   **Magic Link:** Passwordless email entry with cross-device support.
*   **Zero-Trust:** Every request is signed with a Firebase App Check token (ReCAPTCHA Enterprise).

### 3. The "Golden Sync"
**Strict Type Safety Contract.**
*   Backend Pydantic Models (`QuoteSchema`) are mirrored 1:1 in Frontend TypeScript Interfaces (`types/quote.ts`).
*   **Rule:** If it's not in the schema, it doesn't exist in the UI. No `any` types allowed.

---

## 📦 Project Structure

```bash
web_client/
├── app/                  # Next.js App Router (Server Components)
│   ├── api/chat/         # Node.js Proxy for AI Streaming
│   ├── auth/             # Login/Verify Pages
│   └── dashboard/        # Protected User Area (Bento Grid)
├── components/
│   ├── chat/             # Chat Interface & Streaming Logic
│   ├── mobile/           # SwipeGestureEngine & Layouts
│   ├── ui/               # Shadcn/UI Primitive Components
│   └── providers/        # Context Providers (Auth, AppCheck, Chat)
├── hooks/                # Custom React Hooks (useAuth, useSwipe)
├── lib/                  # Utilities (Firebase, Haptics, API)
├── types/                # Golden Sync Interfaces
└── public/               # Static Assets (Images, Icons)
```

---

## 🛠️ Setup & Development

### Prerequisites
*   Node.js 20+
*   npm 10+

### Installation
```bash
cd web_client
npm install
```

### Environment Variables (.env.local)
```ini
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=chatbotluca-a8a73
NEXT_PUBLIC_FIREBASE_APP_CHECK_KEY=...
BACKEND_API_URL=http://localhost:8080/api
```

### Commands
```bash
# Start Dev Server (Port 3000)
npm run dev

# Type Check (Strict)
npm run type-check

# Run Tests
npm test

# Build for Production
npm run build
```

---

_Updated: Feb 2026_
