# 004. The UI is the pitch: white-label brand + visible query translation

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

The Week C/D UI proved the spine but read as scaffolding: system font, bare
header, and the parsed `SearchQuery` — the project's whole thesis — hidden in
a collapsed `<details>`. The demo's audiences are (a) recruiters who give it
30 seconds and (b) engineers who give it five minutes, both from a company
that builds white-label franchise locators. A UI/UX pass was requested
(2026-07-04) and designed first as an annotated mockup; four decisions were
made by the author before implementation: white-label branding, interactive
query chips, browse mode on first load, and List|Map tabs on mobile.

## Options considered

1. **Product-neutral polish (AskNearby brand)** — safest; but it hides the
   most relevant story: this is exactly the deliverable the reviewers ship
   to clients.
2. **White-label as Cedar & Main Outfitters, "powered by AskNearby"** —
   mirrors the employer's real product shape; the fictional brand already
   exists in the data (ADR-001). Slight risk of the repo name and site
   identity diverging, mitigated by the powered-by mark and README.
3. **Query chips display-only vs interactive** — display-only is pure UI;
   interactive (✕ re-runs the search) needs a second endpoint but proves
   the architecture's core claim: only translation costs tokens; everything
   downstream is deterministic and free to re-run.

## Decision

White-label the demo as Cedar & Main (option 2) and make the translated
query a first-class, *interactive* UI element:

- **Query chips:** the model's `SearchQuery` renders as removable chips
  (attributes, place + radius, open-now). Removing one POSTs the edited
  query to **`/api/search/query`** — a new route that accepts a typed
  `SearchQuery` (zod-validated), calls `lib/search` directly, and never
  touches the model. It reuses the per-IP limiter but deliberately not the
  daily AI budget (`checkIpRateLimit` extracted from `checkCostGuard`).
  The already-resolved center travels back as `SearchOutcome.center`, so
  chip re-runs send coordinates and skip re-geocoding entirely.
- **Browse mode:** the server component preloads all stores so the map is
  never empty; example sentences (all real catalog attributes) are
  one-click chips.
- **Locator conventions:** numbered rows ↔ numbered pins (one additive
  optional `ordinal` on `StoreMapMarker`, both adapters), open/closed
  status per store timezone (hours attached by the API via
  `attachStoreHours`; computed client-side by a unit-tested `openStatus`),
  distances displayed in miles (storage stays metric).
- **Design system:** cedar/ember Tailwind tokens grown from the existing
  pin colors; Bitter (display) + Public Sans (UI) + JetBrains Mono
  (engineer surfaces) via `next/font`. A mono footer strip names the live
  stack (model, PostGIS, maps provider) — the swap story on every screen.

## Consequences

- Screenshots now carry the architecture story without narration: chips
  show the translation, the footer names the stack, the JSON toggle shows
  the raw tool-call output.
- Chip edits are free and instant, which also makes the no-results state
  actionable ("remove a chip above").
- `SearchOutcome` gained optional `center` and per-store `hours`; both are
  additive, existing tests unchanged.
- The page is `force-dynamic` (browse mode reads the DB per request) — a
  deliberate trade for a demo; ISR is the obvious later optimization.
- Mobile ships as List|Map tabs (author's call — bottom sheet deferred);
  clustering for browse-mode pins is also deferred (75 pins render fine).
