# AskNearby

**Just say what you're looking for.**

> "a men's department and free parking near Columbus"

That sentence becomes a typed query, a map of matching stores, and a synced
list — with the AI's translation shown as **removable chips** you can edit
without ever calling the model again.

The demo ships white-labeled as **Cedar & Main Outfitters** (a fictional
retail chain, "powered by AskNearby") because that is the product shape
being demonstrated: an enterprise, white-label franchise store locator.

_Demo GIF: `docs/demo.gif` — see [Recording the demo](#recording-the-demo).
Live URL lands with the Vercel deploy._

## The 30-second version

1. Type a sentence (or click an example, or just browse — the map starts
   with every store on it).
2. One forced tool call turns it into a typed `SearchQuery`; the chips
   under the search box **are** that query. A JSON toggle shows the raw
   tool-call output.
3. Postgres + PostGIS produces the results; the UI renders them
   deterministically: numbered rows ↔ numbered pins, open/closed in each
   store's own timezone, distances in miles.
4. Remove a chip and the search re-runs **without the model** — proof that
   only translation costs tokens (~$0.001/search); everything downstream is
   deterministic and free.
5. The mono footer strip names the live stack — model, PostGIS, maps
   vendor — because swapping any of them is the point:

| Swap                    | What it costs                                                                |
| ----------------------- | ---------------------------------------------------------------------------- |
| Anthropic → Gemini      | `AI_PROVIDER=google` (one env var)                                            |
| Model within a provider | `AI_MODEL=...` (one env var)                                                  |
| Google Maps → MapLibre  | `NEXT_PUBLIC_MAPS_PROVIDER=maplibre` (one env var; the adapter is one file)   |
| MapLibre tile vendor    | `NEXT_PUBLIC_MAPLIBRE_STYLE_URL=...` (a URL)                                  |
| Geocoding vendor        | one adapter file behind `GeocodingPort`                                       |

## Architecture

```
 sentence ──▶ POST /api/search ──▶ lib/ai        ONE forced tool call
              (rate limit +        │             (AI_PROVIDER: anthropic | google)
               daily AI budget)    ▼
                             SearchQuery         typed, zod-validated, closed
                                   │             attribute enum from the catalog
        chip edit ──▶ POST /api/search/query ──┐
              (typed SearchQuery in — no model,│
               no geocoder: center is reused)  │
                                   ▼           ▼
                   lib/search ──▶ lib/db       pure mapping → SQL/PostGIS
                         │         │           (ST_DWithin radius, relational
              GeocodingPort        ▼           division, store-local open-now)
             (Google v4 API   Supabase Postgres
              or gazetteer)        │
                                   ▼
                   map + list ◀── SearchOutcome   rows + resolved center +
                                                  no-results diagnosis
        StoreMap contract: google-store-map.tsx | maplibre-store-map.tsx
```

Layer rules (documented in [AGENTS.md](AGENTS.md)): `lib/ai` never touches
SQL or maps; `lib/db` is the only SQL home; `lib/search` is pure functions;
vendors live behind ports in `lib/providers` and behind the `StoreMap`
props contract in `components/store-map`; env-reading composition lives in
`lib/config`.

### API surface

| Route                    | What it does                                                            | Guarded by                    |
| ------------------------ | ----------------------------------------------------------------------- | ----------------------------- |
| `POST /api/search`       | sentence → model translation → results                                  | per-IP limit + daily AI budget |
| `POST /api/search/query` | edited `SearchQuery` → results (chip edits; zero tokens, no re-geocode) | per-IP limit                  |
| `GET /api/stores/:id`    | attributes + weekly hours for the detail slide-over                     | —                             |

## Model comparison (real run, 2026-07-04)

20 golden NL → `SearchQuery` cases, deterministic field-by-field scoring —
no LLM judges (`pnpm eval`):

| Provider  | Model                  | Accuracy on scored cases | Mean latency | p50     | Est. cost/query |
| --------- | ---------------------- | ------------------------ | ------------ | ------- | --------------- |
| anthropic | claude-haiku-4-5       | **20/20 (100%)**         | 967 ms       | 822 ms  | $0.00165        |
| google    | gemini-3-flash-preview | **13/13 (100%)**¹        | 1694 ms      | 1173 ms | $0.00081        |

¹ Gemini's free tier caps at 5 requests/min and 20/day; 7 cases hit the
daily quota (counted as errors, not misses — re-run on a billed key for the
full 20). The headline: **both cheap-tier models translate this domain
essentially perfectly, so the buying decision is latency and cost** — which
is exactly what the harness measures.

## Demo script (~3 minutes)

1. Load the page: browse mode — all 75 stores pinned, nothing typed yet.
2. Click the flagship example sentence → pins narrow, chips appear:
   `men's department` `free parking` `near Columbus · 25 km`.
3. Toggle the JSON view — the chips and the raw tool call are the same
   object; nothing user-visible is generated prose.
4. Remove the `free parking` chip → instant re-run, and the footer's token
   math didn't move: chip edits never call the model.
5. Click a numbered pin → slide-over: attributes, timezone-aware hours
   with open/closed status, directions link.
6. Search "EV charging and a kids department near Denver" → the no-results
   panel explains *why* ("7 stores match your filters — the nearest is
   ~920 mi away") and chips make the fix one click.
7. The payoff: flip `NEXT_PUBLIC_MAPS_PROVIDER=maplibre`, redeploy → same
   app, different maps vendor. Flip `AI_PROVIDER=google` → different AI
   vendor. `pnpm eval`'s matrix is the receipts.

## Getting started

```bash
pnpm install
cp .env.example .env.local        # fill in keys (comments explain each)
pnpm db:migrate                   # Supabase Postgres with PostGIS enabled
pnpm seed                         # deterministic: 75 stores, 4 metros
pnpm dev
```

| Script         | What it does                                         |
| -------------- | ---------------------------------------------------- |
| `pnpm check`   | typecheck + lint + format check + tests              |
| `pnpm ask "…"` | terminal harness: sentence → query JSON + rows       |
| `pnpm eval`    | golden-case eval per provider (paid calls; never CI) |
| `pnpm seed`    | destructive deterministic reseed                     |

Keyboard: `/` focuses the search box, `Esc` closes the slide-over. Mobile
gets List | Map tabs.

### Testing

89 tests in two tiers: pure/unit tests (schema, scorers, seed generation,
SQL shape via `.toSQL()`, mocked-model translation, open-status math)
always run; the live-PostGIS integration suite auto-skips when
`DATABASE_URL` is absent, so CI and offline runs stay green without ever
touching a paid API.

## Recording the demo

Run through the demo script with a screen recorder (e.g. Windows Game Bar
or ScreenToGif), export ~30 s at ≤1200 px wide as `docs/demo.gif`, and it
renders at the top of this page.

## Honesty notes

- **All store data is synthetic** — Cedar & Main Outfitters is fictional,
  seeded deterministically (75 stores over real neighborhood coordinates,
  fictional addresses and 555-01xx phone numbers). Built this way on
  purpose: attribute coverage no Places API has ("men's department"), no
  vendor ToS coupling, and reproducible evals. Real client work can't be
  shown publicly; this repository demonstrates the same architecture
  skills instead.
- **Decision history is part of the deliverable:** one-liners in
  [docs/DECISIONS.md](docs/DECISIONS.md), full arguments in
  [docs/adr/](docs/adr/) — the query-translator architecture and data
  model (ADR-001), Vercel AI SDK vs raw SDK (ADR-002), the map contract
  and ports/adapters layout (ADR-003), and the UI-as-pitch pass with
  interactive chips (ADR-004). Build order:
  [docs/ROADMAP.md](docs/ROADMAP.md).
