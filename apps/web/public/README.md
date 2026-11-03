# Static assets (`apps/web/public`)

Files here are served from the web root, e.g. `public/refx-logo.png` → `/refx-logo.png`.

## Brand logo — `refx-logo.png`

The ReFx logo. A single file powers everything:

- The favicon / browser tab icon, Apple touch icon, and shortcut icon
  (wired in `app/layout.tsx` → `metadata.icons`).
- Open Graph / Twitter link-preview image (`metadata.openGraph`, `metadata.twitter`).
- The brand mark (`components/ui/brand-mark.tsx`, rendered via `<BrandMark />`).

To swap it, replace the file (keep the name). A square PNG of **512×512** or larger
looks best; `<BrandMark />` uses `object-cover` inside a rounded tile. If the image
fails to load, the brand mark falls back to a blue "R" tile.

### Optional extras (auto-detected by Next.js if added to `app/`)

- `app/icon.png` — overrides the favicon with a dedicated icon file.
- `app/apple-icon.png` — dedicated Apple touch icon.
- `app/opengraph-image.png` — dedicated 1200×630 social share image.
