# AskNearby

**Just say what you're looking for.** An AI-powered store locator: type

> "a location with a men's department and free parking near Columbus"

and get a map + synced list of matching stores.

_Demo GIF: `docs/demo.gif` (see [Recording the demo](#recording-the-demo))._

## What this demonstrates

Enterprise locator apps live with two hard vendor dependencies — the AI
provider and the maps platform — and clients arrive committed to different
ones. This project shows an architecture where **both are configuration**:

| Swap                        | What it costs                                     |
| --------------------------- | ------------------------------------------------- |
| Anthropic → Gemini          | `AI_PROVIDER=google` (one env var)                |
| Model within a provider     | `AI_MODEL=...` (one env var)                      |
| Google Maps → MapLibre      | `NEXT_PUBLIC_MAPS_PROVIDER=maplibre` (one env var; the adapter is one file) |
| MapLibre tile vendor        | `NEXT_PUBLIC_MAPLIBRE_STYLE_URL=...` (a URL)      |
| Geocoding vendor            | one adapter file behind `GeocodingPort`           |

The other half of the pitch is **discipline about what the AI is for**:
the model's only job is one forced tool call translating the sentence into
a typed `SearchQuery`. Postgres + PostGIS produces the results; the UI
renders them deterministically. Nothing user-visible is generated text —
which is why the whole AI surface is evaluable with field-by-field diffs
(no LLM judges) and costs ~$0.001 per search.

## Architecture

```
 sentence ──▶ /api/search ──▶ lib/ai        ONE forced tool call
                              │             (AI_PROVIDER: anthropic | google)
                              ▼
                        SearchQuery         typed, zod-validated, closed
                              │             attribute enum from the catalog
                              ▼
              lib/search ──▶ lib/db         pure mapping → SQL/PostGIS
                    │         │             (ST_DWithin radius, relational
         GeocodingPort        ▼             division, store-local open-now)
        (Google v4 API   Supabase Postgres
         or gazetteer)        │
                              ▼
              map + list ◀── SearchOutcome  rows + no-results diagnosis
              (StoreMap contract: google-store-map.tsx | maplibre-store-map.tsx)
```

Layer rules (enforced by review, documented in [AGENTS.md](AGENTS.md)):
`lib/ai` never touches SQL or maps; `lib/db` is the only SQL home;
`lib/search` is pure functions; vendors live behind ports in
`lib/providers` and behind the `StoreMap` props contract in
`components/store-map`; env-reading composition lives in `lib/config`.

## Model comparison (real run, 2026-07-04)

20 golden NL → `SearchQuery` cases, deterministic field-by-field scoring
(`pnpm eval`):

| Provider  | Model                  | Accuracy on scored cases | Mean latency | p50    | Est. cost/query |
| --------- | ---------------------- | ------------------------ | ------------ | ------ | --------------- |
| anthropic | claude-haiku-4-5       | **20/20 (100%)**         | 967 ms       | 822 ms | $0.00165        |
| google    | gemini-3-flash-preview | **13/13 (100%)**¹        | 1694 ms      | 1173 ms | $0.00081        |

¹ Gemini's free tier caps at 5 requests/min and 20/day; 7 cases hit the
daily quota (counted as errors, not misses). Re-run on a billed key for
the full 20. The headline: **both cheap-tier models translate this domain
essentially perfectly — the buying decision is latency and cost**, which
is exactly what the harness measures.

## Demo script (~3 minutes)

1. Type the flagship sentence → pins + distance-sorted list appear.
2. Open **"Parsed query"** under the list — the typed JSON is the entire
   AI output. No prose, nothing to hallucinate.
3. Click a pin → detail panel: attributes, per-day hours (timezone-aware),
   directions link.
4. Search "EV charging and a kids department near Denver" → the
   no-results panel explains *why* ("7 stores match your filters — the
   nearest is 1,481 km away") instead of a silent empty list.
5. "any stores open right now near me" → browser geolocation + store-local
   opening-hours SQL.
6. The payoff: flip `NEXT_PUBLIC_MAPS_PROVIDER=maplibre`, restart → same
   app, different maps vendor. Flip `AI_PROVIDER=google` → same app,
   different AI vendor. Show `pnpm eval`'s matrix as the receipts.

## Getting started

```bash
pnpm install
cp .env.example .env.local        # fill in keys (comments explain each)
pnpm db:migrate                   # Supabase Postgres with PostGIS enabled
pnpm seed                         # deterministic: 75 stores, 4 metros
pnpm dev
```

| Script          | What it does                                          |
| --------------- | ----------------------------------------------------- |
| `pnpm check`    | typecheck + lint + format check + tests               |
| `pnpm ask "…"`  | terminal harness: sentence → query JSON + rows        |
| `pnpm eval`     | golden-case eval per provider (paid calls; never CI)  |
| `pnpm seed`     | destructive deterministic reseed                      |

Live-DB integration tests auto-skip when `DATABASE_URL` is absent, so the
suite is green offline and in CI. The deployed `/api/search` sits behind a
per-IP rate limit and a global daily budget breaker (Postgres counters).

## Recording the demo

Run through the demo script with a screen recorder (e.g. Windows
Game Bar / ScreenToGif), export ~30s at ≤1200px wide as `docs/demo.gif`,
and it will render above.

## Honesty notes

- All store data is **synthetic** (a fictional brand, "Cedar & Main
  Outfitters", seeded deterministically) — built this way on purpose:
  attribute coverage no Places API has, no vendor ToS coupling, and
  reproducible evals. Real client work can't be shown publicly; this
  repository demonstrates the same architecture skills instead.
- Decision history: [docs/DECISIONS.md](docs/DECISIONS.md) one-liners,
  full arguments in [docs/adr/](docs/adr/). Build order:
  [docs/ROADMAP.md](docs/ROADMAP.md).
