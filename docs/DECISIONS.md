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
| 2026-07-04 | Maps behind ports & adapters; Google first, MapLibre-based second                    | ADR-003 (Week C) |
| 2026-07-04 | Speed mode: Claude implements all slices; learning via ai-stack-gym katas 1L.1–1L.4  | —                |
