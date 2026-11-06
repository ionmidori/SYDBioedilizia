# Brand sources: SYD Bioedilizia

Everything the site shows of the brand (logo, icons, favicons, link previews, brand colours) is **generated** from this folder. Nothing in `app/`, `components/` or `public/` writes a brand colour, a logo path or an icon size by hand.

| Folder | What it holds | Edited by |
|---|---|---|
| `tokens/*.tokens.json` | Colours, in the [W3C DTCG](https://www.designtokens.org/tr/drafts/format/) format: `primitives` (measured brand hues + current site palette), `logo` (semantic roles used by the artwork), `tones` (overrides for a surface, derived for contrast) | hand |
| `master/syd-logo.master.svg` | The logo geometry, with **no colours**: `class="logo-<role>"`, parts `icon` / `letters` / `wordmark` | `npm run brand:construct` |
| `source/syd-logo-source.jpg` | The original artwork (1024 px, AI-generated JPEG): reference for measurements and the fidelity gate | — |
| `fonts/` | Red Hat Display 400 (SIL OFL 1.1, see `OFL.txt`), the wordmark typeface | — |

## Pipeline

```
source JPG ──measure──▶ fits ──construct──▶ master SVG ─┐
                                                        ├─ build ─▶ app/brand-tokens.css      (Tailwind @theme + --logo-* roles + tone classes)
tokens/*.tokens.json ───────────────────────────────────┘          lib/brand/*.generated.ts   (colours, logo artwork per variant, asset URLs/sizes)
                                                                   public/favicon.ico, public/brand/*  (icons, logo SVG/PNG, OG image)
```

| Command (repo root) | Does |
|---|---|
| `npm run brand:measure` | Prints the line/circle/Bézier fits on the original (`scripts/brand/measure-mark.py`, uv) |
| `npm run brand:construct` | Rebuilds the master from the measured geometry + the font (`construct-mark.py`, uv) |
| `npm run brand:build` | Tokens → CSS/TS, master + tokens → every asset (`build-tokens.mjs`, `build-assets.mjs`) |
| `npm run brand:check` | Fails if a generated file is stale, or the master drifts from the original (`check.mjs`; `--sheet out.png` writes a visual review sheet) |

The same checks run in CI through `web_client/__tests__/brand-pipeline.test.ts`.

## Changing the brand

- **A colour:** edit `tokens/primitives.tokens.json`, run `npm run brand:build`. Tones are recomputed: each role listed under `syd.tone.minContrast` in `tokens/tones.tokens.json` is lightened in OKLCH just enough to reach its contrast ratio on the tone's surface.
- **A tone for a new surface:** add it under `tone` in `tones.tokens.json` (surface + contrast per role), run `npm run brand:build`. It becomes `<BrandLogo tone="…">`.
- **The geometry:** change the measured constants in `scripts/brand/construct-mark.py`, run `npm run brand:construct && npm run brand:build && npm run brand:check`.
- **A new file (size, variant):** add an entry to `ASSETS` in `scripts/brand/build-assets.mjs`.

In code, use `<BrandLogo variant="horizontal|full|mark|icon" tone="default|on-dark" />` (`components/brand/BrandLogo.tsx`) and the exports of `@/lib/brand`.
