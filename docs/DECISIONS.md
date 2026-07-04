# Decisions

One line per decision; full reasoning in [adr/](./adr/) once each is
formalized at its slice.

| Date       | Decision                                                                             | ADR              |
| ---------- | ------------------------------------------------------------------------------------ | ---------------- |
| 2026-07-04 | AI is a query translator (NL → typed `SearchQuery`), not an answer generator         | [ADR-001](./adr/001-query-translator-and-data-model.md) |
| 2026-07-04 | First-party seeded data over Places APIs (attributes, vendor ToS, deterministic evals) | [ADR-001](./adr/001-query-translator-and-data-model.md) |
| 2026-07-04 | Attribute storage: catalog + join table, not per-attribute columns or jsonb          | [ADR-001](./adr/001-query-translator-and-data-model.md) |
| 2026-07-04 | Geo: lat/lng columns + generated `geography` column, GiST index, `ST_DWithin`        | [ADR-001](./adr/001-query-translator-and-data-model.md) |
| 2026-07-04 | Fictional brand: Cedar & Main Outfitters (4 Midwest metros, 2 time zones)            | [ADR-001](./adr/001-query-translator-and-data-model.md) |
| 2026-07-04 | Vercel AI SDK for provider-agnostic AI (deliberate inverse of MLIP's ADR-002)        | [ADR-002](./adr/002-vercel-ai-sdk.md) |
| 2026-07-04 | Model-facing tool schema is flat; internal `SearchQuery` stays a discriminated union | [ADR-002](./adr/002-vercel-ai-sdk.md) |
| 2026-07-04 | Translator model defaults to `claude-haiku-4-5`, overridable via `AI_MODEL`          | [ADR-002](./adr/002-vercel-ai-sdk.md) |
| 2026-07-04 | Maps behind ports & adapters; Google first, MapLibre-based second                    | [ADR-003](./adr/003-map-contract-and-ports.md) |
| 2026-07-04 | Geocoding via Google **v4** API (v3 legacy); env-driven fallback to offline gazetteer | [ADR-003](./adr/003-map-contract-and-ports.md) |
| 2026-07-04 | Map selection/hover state owned by the page; `StoreMap` is a controlled component     | [ADR-003](./adr/003-map-contract-and-ports.md) |
| 2026-07-04 | Speed mode: Claude implements all slices; learning via ai-stack-gym katas 1L.1–1L.4  | —                |
| 2026-07-04 | Cost-protection counters live in Postgres (already provisioned), not Redis/Upstash    | — (commit `feat(cost)`) |
| 2026-07-04 | Second AI provider defaults to `gemini-3-flash-preview` (the comparable cheap tier)   | [ADR-002](./adr/002-vercel-ai-sdk.md) |
| 2026-07-04 | MapLibre tiles: keyless OpenFreeMap default (Radar/Mapbox = a style-URL change), not the roadmap's keyed vendors | [ADR-003](./adr/003-map-contract-and-ports.md) |
