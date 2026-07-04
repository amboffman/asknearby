# 002. Vercel AI SDK over the raw Anthropic SDK

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

The AI layer has exactly one job (ADR-001): NL → typed `SearchQuery` via one
forced tool call. The roadmap requires the same call to run against
Anthropic first, Gemini in Week E behind an `AI_PROVIDER` switch, and
Bedrock documented as the third — with an eval matrix comparing them. MLIP
(the sibling project) deliberately chose the **raw Anthropic SDK** to learn
the wire format; this project exists to demonstrate the opposite skill:
vendor-agnostic architecture where a provider swap is configuration.

## Options considered

1. **Raw `@anthropic-ai/sdk`** — direct access to the full surface
   (forced `tool_choice`, `strict: true`, prompt caching, betas), no
   abstraction lag. But the Week E swap means writing a second integration
   plus a home-grown provider interface — rebuilding the AI SDK badly —
   and the eval harness needs per-provider request/response normalization.
2. **Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)** — one `LanguageModel`
   interface; tool schemas written once in zod and converted per provider;
   forced tool choice normalized (`toolChoice: {type: "tool", toolName}`);
   usage/latency normalized for the eval matrix; first-class mock models
   (`MockLanguageModelV4` + recorded `doGenerateCalls`) for offline tests.
   Costs: provider features lag behind the abstraction (Anthropic-specific
   knobs live in `providerOptions` escape hatches), and the API moves fast
   (v7 today; training-data idioms from v5 are already stale — docs-first
   is mandatory).
3. **Orchestration frameworks (LangChain et al.)** — built for chains and
   agent loops; this app makes exactly one model call. Pure overhead.

## Decision

**Vercel AI SDK.** The provider-agnostic interface is not a convenience
here — it is the product being demonstrated. `lib/ai` stays thin (one
`translateQuery` function) so the abstraction never spreads.

### What the SDK abstracts (recorded against MLIP's raw-SDK experience)

- Message/content-block wire shapes and provider auth.
- zod → per-provider JSON Schema conversion for tool inputs.
- Forced-tool-call semantics across providers.
- Retries, and normalized usage/latency numbers (feeds Week E's matrix).
- Model mocking for tests (no HTTP, assertable request payloads).

### Implementation findings worth keeping

- **The SDK does not throw on schema-invalid tool input** (it marks the
  call invalid and hands back the raw object). `translateQuery`
  re-validates with the catalog-constrained schema itself — the enum
  guarantee is ours, not the SDK's.
- **Wire schema ≠ internal contract.** Live testing showed Haiku mangling
  a nested discriminated union (`geo` emitted as a bare string). The
  model-facing tool schema is deliberately flat (optional
  `placeName`/`latitude`/`longitude`); `toSearchQuery` lifts it into the
  internal union, which stays fully typed.
- **Default model: `claude-haiku-4-5`** ($1/$5 per MTok — the translator
  emits ~100 output tokens, and cheap+fast is ADR-001's stated rationale),
  overridable via `AI_MODEL` (e.g. `claude-opus-4-8`). Week E's eval
  harness turns this choice into data instead of opinion.

## Consequences

- Week E's Gemini swap is `@ai-sdk/google` + an env switch — no changes in
  `lib/ai`'s call site; the eval harness scores both on identical inputs.
- Anthropic-specific capabilities (prompt caching, strict mode, thinking)
  are only reachable through `providerOptions`; if one ever becomes
  load-bearing, revisit this ADR — the thin `translateQuery` seam makes a
  raw-SDK fallback a one-file change.
- The SDK's release velocity means every session touching `lib/ai` starts
  from the installed package's types, not memory (AGENTS.md rule 3).
