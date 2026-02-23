---
name: enterprise-user-dashboard-ux
description: Enterprise-grade guidelines for creating 2026 modern User Dashboards (Area Personale). Integrates Bento Grid layouts, Glassmorphism aesthetics, Shadcn UI components, and Next.js App Router performance best practices based on popular GitHub repositories.
---

# Enterprise User Dashboard UX (Area Personale) - 2026 Standards

This skill synthesizes best practices from the most popular open-source React/Next.js dashboard repositories (like Horizon UI, TailAdmin, and Shadcn templates) to create cutting-edge, enterprise-grade user dashboards for the "Area Personale".

## 1. Architectural Patterns (Tier 2 - Frontend)

*   **Next.js Server Components (RSC) by Default:** Data fetching for the dashboard (e.g., user profile, project summaries, statistics) MUST happen on the server. Use `"use client"` exclusively for interactive leaf components (like interactive charts, toggle switches, or modal dialogs).
*   **Separation of Concerns:** Keep business logic in `backend_python` (Tier 3). The dashboard is strictly for orchestration, state presentation, and routing. 
*   **Shadcn UI as the Primitive Foundation:** Do not build complex components from scratch if generic primitives exist. Use extended Shadcn components (Cards, Tables, Dialogs, dropdowns) to maintain a cohesive, accessible design system.

## 2. Visual Design & Aesthetics (2026 Trends)

*   **Bento Grid Layouts:** 
    *   Organize dashboard widgets using a CSS Grid layout inspired by the Japanese Bento box.
    *   Use variable spans (`col-span-1`, `col-span-2`, `row-span-2`) to create visual hierarchy. Important metrics get larger tiles.
    *   Ensure exact gap spacing (e.g., `gap-4` or `gap-6`) across all breakpoints.
*   **Refined Glassmorphism:**
    *   Do NOT overuse blur. Apply subtle `backdrop-filter: blur(12px)` combined with semi-transparent backgrounds (e.g., `bg-white/5` in dark mode).
    *   Add ultra-thin, semi-transparent borders (e.g., `border border-white/10`) to define the edges of glass cards without relying solely on heavy drop shadows.
*   **Micro-Animations (Framer Motion):**
    *   Implement subtle reveal animations on initial load (`initial={{ opacity: 0, y: 10 }}`).
    *   Use scale transitions on hover for interactive elements to make the interface feel alive, without causing layout shifts.

## 3. Core Component Requirements for the "Area Personale"

When building the personalized dashboard, include these enterprise-standard elements:

1.  **Contextual Header:** A personalized greeting ("Bentornato, [Nome]"), current date, and a high-level summary badge (e.g., "Progetto Attivo").
2.  **KPI / Metrics Ribbon:** A top row of 3-4 key performance indicators (e.g., Preventivi Ricevuti, Fatture Da Pagare, Documenti Condivisi) using engaging icons (Lucide-React) and sparkline trends if applicable.
3.  **Active Project Tracking (The "Hero" Widget):** A large Bento card detailing the status of the current renovation project, including a visual progress bar or circular progress indicator.
4.  **Recent Activity / Documents:** A clean, scrollable list (or table) of the most recent interactions, quotes, or uploaded floor plans, with clear "Download" action buttons.
5.  **Quick Actions:** A dedicated pane or floating action area for common tasks (e.g., "Nuova Richiesta", "Carica Planimetria", "Contatta Architetto").

## 4. Implementation Workflow

1.  **Define Layout:** Start with a responsive `grid` container in the main page component.
2.  **Build Skeletons:** Implement React Suspense boundaries with skeleton loaders (`<Skeleton className="h-[200px] w-full" />`) for asynchronous widget data fetching.
3.  **Assemble Bento Widgets:** Create individual, self-contained components for each dashboard tile (e.g., `ProjectStatusWidget`, `DocumentsWidget`, `KPIWidget`).
4.  **Apply Polish:** Inject Glassmorphism utility classes and Framer Motion wrappers.

> [!IMPORTANT]
> Always verify that dashboard styling uses the established project color palette (e.g., `luxury-bg`, `luxury-gold`, `luxury-text` from `tailwind.config.js`) to maintain brand consistency.
