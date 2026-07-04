# AskNearby — Agent Operating Manual

Capability pitch demo: an AI-powered store locator. Users say what they want
in plain language ("a location with a men's department and free parking near
Columbus") and get a map + synced list of matching stores from a first-party
dataset. Built to demonstrate skill to the author's employer (enterprise
franchise locator apps) because real client work can't be shown publicly.
**Synthetic data only — never add real client data or company code.**

## Working contract: speed mode

Unlike MLIP's tutor mode, **Claude implements everything here** (author's
call, 2026-07-04). Learning is deliberately relocated: core mechanisms get
hand-rebuild katas in the separate `ai-stack-gym` repo (Level 1L). When a
slice produces something kata-worthy, add a row to the gym's PROGRESS.md
instead of slowing this repo down.

Still non-negotiable:

- **ADRs for non-obvious decisions** — `docs/adr/` (use `_template.md`) plus
  a one-liner in `docs/DECISIONS.md`. They are pitch material (the "why is
  this swappable" story), not just process.
- **Design-first, briefly:** open each slice with a short options/tradeoffs
  note before code. No silent architecture decisions.

## Every session, in order

1. Read [docs/ROADMAP.md](docs/ROADMAP.md). Work the first unchecked item of
   the current week. Don't skip ahead; don't widen a slice's scope.
2. Before writing Next.js code, read the relevant vendored guide in
   `node_modules/next/dist/docs/` — this is Next 16; training-data habits
   are stale. Heed deprecation notices.
3. Before writing Vercel AI SDK, Anthropic, or maps-vendor code, consult
   current docs (in Claude Code, the `claude-api` skill covers Anthropic).
   These APIs move fast — do not code them from memory.
4. A slice is done when: acceptance criteria met, `pnpm check` green, new
   logic has tests, ADR written if warranted, ROADMAP checkbox updated.

## Architecture boundaries

`src/lib/` layers are separated on purpose:

- `lib/ai` — Vercel AI SDK orchestration: NL → typed `SearchQuery` via one
  forced tool call. Server-only. No SQL, no JSX, no maps-vendor calls.
- `lib/providers` — ports + adapters for maps vendors (`GeocodingPort`,
  `AutocompletePort`, …). Pure I/O translation; no business logic.
- `lib/db` — the only place SQL/Drizzle/PostGIS lives. Returns domain types,
  not rows.
- `lib/search` — pure functions: `SearchQuery` → typed `lib/db` calls. No
  AI, no HTTP; fully unit-testable.
- `lib/types` — only types that cross module boundaries.

The map UI follows the same idea: one `<StoreMap/>` props contract; vendor
implementations live behind it, chosen by config.

## Environment notes

- Windows dev machine (PowerShell). Cross-platform scripts only: `tsx`, no
  bash-isms, no hardcoded paths.
- pnpm is pinned via `packageManager`. Secrets live in `.env.local`
  (gitignored); mirror every new variable into `.env.example` with a
  comment.
- Evals cost API tokens: never wire them into CI. CI runs
  typecheck/lint/format/test/build — nothing that calls a paid API.
- Before the deployed URL is shared anywhere, the MLIP cost-protection
  pattern (per-IP rate limit + daily budget breaker) and restricted,
  quota-capped maps keys must be in place.
