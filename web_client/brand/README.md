# Brand sources: SYD Bioedilizia

Everything the site shows of the brand (logo, icons, favicons, link previews, colours, fonts, shadows) is **generated** from this folder. Nothing in `app/`, `components/` or `public/` writes a colour, a font, a logo path or an icon size by hand: `__tests__/no-hardcoded-colors.test.ts` and the `better-tailwindcss/no-unknown-classes` lint rule enforce it.

| Folder | What it holds | Edited by |
|---|---|---|
| `tokens/*.tokens.json` | Design tokens in the [W3C DTCG](https://www.designtokens.org/tr/drafts/format/) format: `primitives` (measured brand hues, the tonal ramps generated from them, third-party colours), `roles` (the semantic colour vocabulary and the contrast each role must reach), `elevation` (shadows), `typography` (font roles, the wordmark), `logo` (roles used by the artwork), `tones` (logo overrides for a surface, derived for contrast) | hand |
| `tokens/themes/<name>.tokens.json` | A theme: the value of every role on each surface (`default`, `inverse`). `brand.json` names the active one (`light`) | hand |
| `master/syd-logo.master.svg` | The logo geometry, with **no colours**: `class="logo-<role>"`, parts `icon` / `letters` / `wordmark` | `npm run brand:construct` |
| `source/syd-logo-source.jpg` | The original artwork (1024 px, AI-generated JPEG): reference for measurements and the fidelity gate | — |
| `fonts/` | Red Hat Display 400 (SIL OFL 1.1, see `OFL.txt`), the wordmark typeface | — |

## Pipeline

```
source JPG ──measure──▶ fits ──construct──▶ master SVG ─┐
                                                        ├─ build ─▶ app/brand-tokens.css      (roles, surfaces, fonts, shadows, wordmark, --logo-* roles, tones)
tokens/*.tokens.json ───────────────────────────────────┘          lib/brand/*.generated.ts   (roles, fonts, colours, logo artwork, asset URLs/sizes)
                                                                   scripts/brand/generated/roles.json  (role vocabulary for the codemod and guards)
                                                                   public/favicon.ico, public/brand/*  (icons, logo SVG/PNG, OG image)
```

| Command (repo root) | Does |
|---|---|
| `npm run brand:measure` | Prints the line/circle/Bézier fits on the original (`scripts/brand/measure-mark.py`, uv) |
| `npm run brand:construct` | Rebuilds the master from the measured geometry + the font (`construct-mark.py`, uv) |
| `npm run brand:build` | Tokens → CSS/TS, master + tokens → every asset (`build-tokens.mjs`, `build-assets.mjs`) |
| `npm run brand:check` | Fails if a generated file is stale, or the master drifts from the original (`check.mjs`; `--sheet out.png` writes a visual review sheet) |

The same checks run in CI through `web_client/__tests__/brand-pipeline.test.ts`.

## Colour: roles, themes, surfaces

Components colour themselves only with **roles**: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`, `border-line`, `bg-primary` + `text-on-primary`, `text-accent-ink`, `bg-danger-subtle` + `text-danger-ink`, ... (`tokens/roles.tokens.json` lists them all). The build is the **contrast gate**: every role requirement (e.g. `ink-muted` ≥ 4.5:1 on `canvas`, `surface` and `surface-muted`) is checked on every surface of every theme, and a miss fails `npm run brand:build`. No theme can opt out.

- **Text roles take no opacity** (`text-ink/60` is rejected by the guard test): their contrast is only checkable at full strength. Use `text-ink-muted` or `text-ink-subtle` (large text and icons only).
- **Surfaces:** a container with `surface-inverse` (footer, final CTA band, the chat welcome bubble) redefines the roles for its subtree, and the logo takes its `on-dark` tone with it. Children keep `text-ink`, `border-line`, ...: no per-surface classes, no `tone` prop.
- **Depth** comes from elevation (`shadow-1/2/3`, or `<Card elevation>`), not glass; `glass` is the exception for bars and panels over scrolling content.
- **New shadcn components:** run `npm run theme:migrate -- --write "<glob>"` to move their classes onto the roles, then `--check`.

## Typography

`tokens/typography.tokens.json` declares the font roles (`font-sans` Lato, `font-serif` Playfair Display, `font-brand` Red Hat Display) and the **wordmark**. `next/font` only takes literal arguments, so `app/layout.tsx` writes the faces out; `__tests__/fonts.test.ts` holds them to the tokens. The brand name inside running text uses the `wordmark` utility (the logo's face, weight, case and tracking, measured on the master): `<span className="wordmark">SYD BIOEDILIZIA</span>`. As a standalone identity, use `<BrandLogo>`.

## Changing the brand

- **A role's colour:** change its reference in `tokens/themes/light.tokens.json` (references to the ramps or the brand colours, never literals), run `npm run brand:build`. The gate tells you if a requirement breaks.
- **A new role:** add it to `tokens/roles.tokens.json` with its contrast requirements and give it a value on every surface of every theme.
- **A new theme:** copy `themes/light.tokens.json` with the same keys and point `brand.json` at it; the gate validates it like any other.
- **A brand primitive:** edit `tokens/primitives.tokens.json`, run `npm run brand:build`. Ramps and tones are recomputed: each logo role listed under `syd.tone.minContrast` in `tokens/tones.tokens.json` is lightened in OKLCH just enough to reach its contrast ratio on the tone's surface.
- **A logo tone for a surface:** add it under `tone` in `tones.tokens.json`, with `surface` pointing at the theme surface (`{theme.surface.inverse.canvas}`), and link it in the theme's `logoTone`. `<BrandLogo tone="…">` stays as an explicit override.
- **The geometry:** change the measured constants in `scripts/brand/construct-mark.py`, run `npm run brand:construct && npm run brand:build && npm run brand:check`.
- **A new file (size, variant):** add an entry to `ASSETS` in `scripts/brand/build-assets.mjs`.

In code, use `<BrandLogo variant="horizontal|full|mark|icon" />` (`components/brand/BrandLogo.tsx`; it takes its tone from the surface it sits on) and the exports of `@/lib/brand`.
