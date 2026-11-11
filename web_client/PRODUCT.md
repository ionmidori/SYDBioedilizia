# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Private homeowners in Rome and the surrounding area who want to renovate an apartment. They arrive wanting to understand feasibility and cost and to request a free quote, without a long back-and-forth. (Confirmed by the user. Other audiences such as condominium administrators or professionals are not part of the confirmed target.)

## Product Purpose

The website and AI platform of SYD Bioedilizia S.r.l., a renovation company based in Rome. It lets a visitor go from idea to a quote quickly: browse real completed projects, then talk to an AI assistant that triages photos/videos of the space, generates photorealistic renders of the renovated room and drafts quotes. Success is a visitor requesting a free quote.

## Positioning

Speed and simplicity of the online quote: from idea to a quote "in a few clicks" (confirmed by the user as the differentiator). The renovation itself can be traditional or in bioedilizia.

## Operating Context

- Public site: homepage with a project gallery, `/progetti` (portfolio archive), `/chi-siamo`, `/faq`, `/blog`, legal pages, cookie consent.
- AI chat assistant (triage, design, quote). Premium actions (renders, quotes) require login.
- Quotes are drafted from the internal price book and the Prezzario Regione Lazio 2023, and are reviewed and approved by a person in the admin console before being delivered as PDF by email.
- Client area (`/dashboard`: projects, files, renders, quotes) and admin console (`/admin`: quotes, price book, portfolio, testimonials, GDPR tools).
- Stack: Next.js 16 App Router, React 19, Tailwind CSS 4, Framer Motion; FastAPI + Google ADK backend.

## Capabilities and Constraints

- Language of the product: Italian.
- Portfolio gallery shows real projects first, then examples up to a minimum number of cards. Examples are always labelled "Esempio" and never carry invented stats (rule enforced in `lib/portfolio/presentation.ts`).
- Homepage gallery cards show only the project photo; the description is collapsed by default and opens on click (user request, 2026-11-12). Title, category, place and stats appear only on `/progetti`.
- Undecided: tone-of-voice rules beyond the existing copy, and any audience beyond private homeowners.

## Brand Commitments

- SYD Bioedilizia name, logo and `wordmark` typography.
- Light theme only, with the current brand colors: canvas `#fbf6ee`, ink `#16233b`, primary `#1d4ed8`, accent `#cda865` (token source: `brand.json` and the DTCG token files).

## Evidence on Hand

- Real completed projects, managed through the admin portfolio and served by `getPortfolio()`.
- Testimonials managed in the admin console.
- Blog with 8 articles; Prezzario Regione Lazio 2023 ingested (2,859 articles).
- Not on hand / must not be fabricated: customer names, project stats or testimonials not present in the admin data.

## Product Principles

- A visitor should be one step from a free quote from any point of the site.
- Real work leads: photos of completed projects come first, examples are never passed off as real.
- Speed and simplicity over exhaustive detail: show less, reveal on demand.
- AI proposes, a person approves: nothing priced reaches a client unreviewed.

## Accessibility & Inclusion

WCAG 2.2 AA is required, enforced with a contrast gate at build time and a blocking axe-core audit in CI. Honor `prefers-reduced-motion`.

