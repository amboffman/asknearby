# Roadmap

**This file is the source of truth for what to build and in what order.**
Agents: at the start of every session, find the first unchecked item in the
current week and work on that. Update checkboxes as work lands. Do not start
a later slice while an earlier one is unfinished, and do not widen a slice's
scope beyond its acceptance criteria.

## Goal and constraints

- **Purpose:** a capability pitch demo for the author's employer (enterprise
  franchise locator apps). Real client work can't be shown publicly, so this
  demonstrates the skill instead. Doubles as portfolio material.
- **Target:** demoable ~Aug 16, 2026, built in parallel with MLIP's final
  weeks (MLIP feature freeze Aug 25; its Sept 1 deadline wins ties).
- **Work style:** speed mode — Claude implements every slice (author's call,
  2026-07-04). No author-owned slices. Learning is relocated to the separate
  ai-stack-gym repo (Level 1L katas). ADRs are still written — they are
  pitch material, not just process.
- **Data:** synthetic only. Never real client data or company code.

## Locked-in decisions (2026-07-04; formalize as ADRs when each slice lands)

- **AI as query translator, not answer generator** (→ ADR-001): the model's
  only job is natural language → typed `SearchQuery` via one forced tool
  call. The database produces results; the UI renders them
  deterministically. Cheap, fast, reliable, trivially evaluable.
- **First-party seeded data:** one fictional brand, ~75 stores with rich
  attributes (departments, parking, hours, services) in Supabase Postgres
  with **PostGIS**. Why not a Places API: attribute coverage (no API knows
  "men's department"), vendor ToS (their data must render on their map),
  and deterministic evals.
- **Vercel AI SDK** (→ ADR-002): the deliberate inverse of MLIP's raw-SDK
  choice. One interface for tool calling across Anthropic (first), Gemini
  (Week E swap), Bedrock (documented as the third).
- **Maps: ports and adapters, Google first** (→ ADR-003): server-side
  `GeocodingPort`/`AutocompletePort` with a Google adapter; one
  `<StoreMap/>` React props contract with a Google Maps JS implementation.
  A MapLibre-based second adapter (Week F) proves the swap. Google is first
  because it's what the business's clients use.
- **Fictional brand name:** decide at ADR-001 (candidate: Cedar & Main
  Outfitters — must sound like a real mid-size chain).

## Weekly plan

Each week ends demoable. "Done" for any slice = acceptance criteria met,
`pnpm check` green, new logic tested, ADR written if a non-obvious decision
was made, checkbox updated here.

### Week A (Jul 6–12) — Data foundation

- [x] Repo scaffold: toolchain mirrored from MLIP, founding docs, app
      skeleton (scaffolded 2026-07-04)
- [x] ADR-001: query-translator architecture + data model (attribute
      storage: columns vs jsonb vs join table — argue it like a locator
      veteran; pick the fictional brand name) (2026-07-04:
      [ADR-001](adr/001-query-translator-and-data-model.md) — catalog +
      join table; brand: Cedar & Main Outfitters)
- [x] Supabase project with PostGIS enabled; `DATABASE_URL` in `.env.local`
      (author does account setup), then migrate + seed against it
      (2026-07-04: migrated, seeded 75 stores, all 19 tests green incl. the
      live-PostGIS integration suite — **Week A complete**)
- [x] Drizzle schema + migrations (stores with a `geography` column,
      attribute storage per ADR-001) (2026-07-04; migrations authored, first
      run happens with the item above)
- [x] Deterministic seed (`pnpm seed`, seeded RNG): ~75 stores across 3–4
      metro areas with plausible attribute distributions (2026-07-04; 75
      stores / 4 metros, generation unit-tested)
- [x] Typed queries in `lib/db` incl. radius search (`ST_DWithin`), with
      tests (2026-07-04; SQL-shape tests always run, live-PostGIS suite
      auto-skips until `DATABASE_URL` exists)

**Demo:** seeded DB; radius query test green.

### Week B (Jul 13–19) — AI translation core

- [x] `SearchQuery` zod schema in `lib/types`: attribute filters, geo intent
      (place name | coordinates | none), radius, open-now (2026-07-04; plus
      a flat model-facing tool-schema variant — see ADR-002)
- [x] `lib/ai`: Vercel AI SDK + Anthropic provider, one forced tool call
      NL → `SearchQuery`; tested against a mocked model (2026-07-04;
      default `claude-haiku-4-5`, `AI_MODEL` override)
- [x] `lib/search`: pure functions `SearchQuery` → `lib/db` calls, unit
      tested (2026-07-04; incl. open-now SQL in lib/db and a gazetteer
      `GeocodingPort` adapter pulled forward from Week C)
- [x] Terminal harness: `pnpm ask "…"` → query JSON + matching rows
      (2026-07-04; verified live — flagship, open-now, and radius queries)
- [x] ADR-002: Vercel AI SDK vs raw SDK (record what it abstracts vs MLIP)
      (2026-07-04: [ADR-002](adr/002-vercel-ai-sdk.md))

**Demo:** `pnpm ask "stores with a men's department and free parking near
Columbus"` → query JSON + rows in the terminal.

### Week C (Jul 20–26) — Map + list UI

- [x] `GeocodingPort` + Google adapter in `lib/providers` ("near Columbus"
      → coordinates), fixture-tested (2026-07-04; Geocoding API **v4**;
      live call awaits enabling the API in the Cloud Console)
- [x] `<StoreMap/>` props contract + Google Maps JS implementation (read
      current Google docs at slice start — do not code the SDK from memory)
      (2026-07-04; `@vis.gl/react-google-maps`, AdvancedMarker + mapId)
- [x] Results list synced with the map (hover row ↔ highlight pin, click
      pin ↔ scroll list) (2026-07-04)
- [x] Search box wired end to end: sentence → translate → query → map + list
      (2026-07-04; verified against the live dev server — flagship sentence
      → 12 rows; browser pin check awaits Maps JS API enablement)
- [x] ADR-003: the map component contract + ports/adapters layout
      (2026-07-04: [ADR-003](adr/003-map-contract-and-ports.md))

**Demo:** type the sentence in a browser, watch pins appear.

### Week D (Jul 27–Aug 2) — Spine polish + deploy ⚑ go/no-go

- [x] Store detail panel (attributes, hours, directions link) (2026-07-04)
- [x] "Near me": browser geolocation with typed-place fallback (2026-07-04;
      explicit places always win over the user's coordinates)
- [x] No-results handling (show which filters matched nothing) (2026-07-04;
      per-filter chain-wide counts + nearest-match distance)
- [ ] Deploy to Vercel: MLIP cost-protection pattern (per-IP rate limit +
      daily budget breaker), referrer-restricted browser maps key, quota
      caps on every Google API
      (cost protection landed 2026-07-04 — Postgres `usage_counters`,
      guard before every model call; **remaining: author creates the
      Vercel project** — push to GitHub, import repo, set env vars, then
      referrer-restrict the browser key to the deploy URL)
- [ ] **Checkpoint (Aug 2):** if not deployed, cut Weeks E–F extras per the
      trim ladder and finish the spine.

**Demo:** the live URL.

### Week E (Aug 3–9) — Agnostic payoff 1: models

- [x] Second AI provider (Gemini via `@ai-sdk/google`) behind an
      `AI_PROVIDER` config switch (2026-07-04; default
      `gemini-3-flash-preview`, the comparable cheap tier)
- [x] Eval harness: ~20 golden NL → `SearchQuery` cases from the seed;
      deterministic field-by-field scorers (never in CI) (2026-07-04;
      20 cases, scorers unit-tested)
- [x] Cross-provider report: accuracy / latency / cost per model
      (`pnpm eval` → eval-reports/) (2026-07-04: Haiku 20/20, Gemini 13/13
      on the cases its free tier allowed — 5 RPM / 20 RPD; re-run on a
      billed key for full 20. Matrix embedded in README)

**Demo:** the model-comparison matrix. (Gym kata 1L.3 rebuilds the scorers
by hand.)

### Week F (Aug 10–16) — Agnostic payoff 2: maps + pitch

- [x] MapLibre-based second `<StoreMap/>` implementation (Radar or Mapbox
      tiles — pick at slice start) behind a `MAPS_PROVIDER` switch
      (2026-07-04; picked keyless OpenFreeMap tiles instead — zero-signup
      flip; Radar/Mapbox = `NEXT_PUBLIC_MAPLIBRE_STYLE_URL` change)
- [x] README → pitch document: architecture diagram, the swap story ("a
      client on vendor X costs one adapter"), eval matrix, demo script
      (2026-07-04)
- [x] UI/UX pitch pass (author-requested 2026-07-04, outside the original
      slice plan): white-label Cedar & Main design system, interactive
      query chips + deterministic `/api/search/query`, browse mode,
      numbered pins, open-now status, mobile tabs
      ([ADR-004](adr/004-ui-as-pitch-surface.md))
- [ ] Record a short demo GIF (author: needs a screen recorder — script
      and export specs are in README "Recording the demo")

**Demo:** flip one env var → same app, different map, different model.

## Trim ladder

Cut in this order, and only at the Aug 2 checkpoint:

1. Second maps adapter (keep the ports — the interface is the story)
2. Cross-provider eval matrix (keep single-provider evals)
3. Autocomplete / "near me" polish
4. Detail-panel polish

**Never cut:** the deployed NL-search → map + list spine, the eval harness,
the ADRs.

## Dependencies to add (per week, not before)

- W-A: `drizzle-orm`, `drizzle-kit`, `postgres`, `zod`, `dotenv`, `tsx`
- W-B: `ai`, `@ai-sdk/anthropic`
- W-C: Google Maps React library (confirm the current package at slice
  start — docs-first)
- W-E: `@ai-sdk/google`
- W-F: `maplibre-gl` (+ React wrapper — decide at slice start)
