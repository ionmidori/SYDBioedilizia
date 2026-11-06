/**
 * Portfolio module — shared by the homepage gallery (`components/sections/Portfolio.tsx`,
 * inside the Hero) and the archive page (`app/progetti/`).
 *
 *   types.ts         domain model + response schema (Golden Sync with the backend)
 *   config.ts        display settings (rail size, visible stats, cache time)
 *   api.ts           fetch + parse, browser side
 *   server.ts        `getPortfolio()` for Server Components (not re-exported here)
 *   use-portfolio-projects.ts  client hook: server data + browser retry (not re-exported)
 *   runtime.ts       browser/server detection (stubbed in tests)
 *   categories.ts    filter vocabulary derived from the data
 *   presentation.ts  alt text and stats formatting
 *   examples.ts      example cards (stock, labelled) that fill a gallery up to PORTFOLIO_MIN_CARDS
 *
 * The content itself lives in Firestore and is edited from /admin/portfolio
 * (or added with `backend_python/scripts/add_portfolio_project.py`).
 */
export * from './types';
export * from './config';
export * from './categories';
export * from './presentation';
export { exampleProjects } from './examples';
export { fetchPortfolio, parsePortfolio, requestPortfolio } from './api';
