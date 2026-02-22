# 🎨 SYD Vision (Web Client)

The premium, high-fidelity frontend for the SYD Renovation Ecosystem.
Built with **Next.js 16**, **Tailwind CSS 4**, and **Shadcn/UI**.

---

## 🚀 Key Features

- **Next.js 16 App Router**: Leveraging React Server Components (RSC) for maximum performance and SEO.
- **Premium Aesthetics**: Glassmorphism, Bento Grids, and fluid micro-animations via Framer Motion 12.
- **Vercel AI SDK**: Resilient streaming architecture for real-time AI interactions.
- **Golden Sync**: Strict TypeScript interfaces mirrored 1:1 with backend Pydantic models.
- **Enterprise Dashboard**: Comprehensive admin and user views with complex data visualizations.
- **Universal Gestures**: Custom-engineered mobile swipe engine for a fluid app-like experience.

## 🏛️ Architectural Boundaries

Following the **3-Tier Law**:
- **Execution Logic**: Offloaded to the Tier 3 (Python Backend).
- **Presentation Logic**: Managed via Server Actions and strongly-typed API clients.
- **State Management**: Prefer URL-state (Zustand/SWR for complex sessions).

## 🛠️ Tech Stack

- **Framework**: Next.js 16.1 (App Router)
- **Styling**: Tailwind CSS 4, Lucide React
- **Animations**: Framer Motion 12
- **Validation**: Zod (mapped to Pydantic schemas)
- **Authentication**: Firebase Auth + App Check
- **Data Fetching**: SWR / Server Actions

## 📦 Setup & Installation

### Prerequisites
- Node.js 20+
- npm 10+

### Installation
```bash
cd web_client
npm install
```

### Environment Variables
Create a `.env.local` file in `web_client/`:
```ini
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=chatbotluca-a8a73
NEXT_PUBLIC_FIREBASE_APP_CHECK_KEY=...
BACKEND_API_URL=http://localhost:8080/api
```

## ▶️ Running Locally

```bash
# Start dev server
npm run dev
```

## 🧪 Quality Assurance

```bash
# Type check strictly (no any allowed)
npm run type-check

# Run production build validation
npm run build

# Unit testing (Jest)
npm test
```

## 📂 Project Structure

```
web_client/
├── app/             # App Router Pages & Layouts
├── components/      # UI, Layout, & Shared Components
├── hooks/           # Custom React Hooks
├── lib/             # API Clients & Utility Libraries
├── types/           # Golden Sync TypeScript Interfaces
├── public/          # Static Assets & Global Config
└── vercel.json      # Deployment Configuration
```

---

_Updated: Feb 22, 2026_
