# 001. AI as query translator; first-party data with an attribute catalog

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

AskNearby is a capability-pitch demo of an AI-powered store locator: a user
types "a location with a men's department and free parking near Columbus"
and gets a map + synced list. Two foundational questions have to be settled
before any schema or AI code is written:

1. **What is the AI's job?** Everything downstream (cost, latency,
   reliability, evaluability) follows from this.
2. **Where do stores and their attributes live, and how are attributes
   stored?** Enterprise franchise locators live or die on attribute
   filtering ("curbside pickup", "pharmacy", "open 24h"), and attribute
   catalogs churn constantly — merchandising adds and retires them every
   season, and every client's catalog is different.

Constraints: demoable by mid-August 2026, synthetic data only, and the
architecture itself is the pitch — decisions must be defensible to people
who build locator apps for a living.

## Options considered

### 1. The AI's job

1. **Answer generator (RAG-style):** feed candidate stores to the model,
   let it compose the answer. Pros: flexible prose. Cons: slow, expensive,
   hallucination surface over factual data (hours, addresses), impossible
   to eval deterministically, and the map/list UI needs structured data
   anyway.
2. **Query translator (one forced tool call):** the model's only output is
   a typed `SearchQuery`; Postgres produces the results; the UI renders
   them deterministically. Pros: cheap (one small completion), fast,
   nothing user-visible is generated text, and evals reduce to
   field-by-field comparison of two JSON objects. Cons: the model can't
   answer questions outside the schema — which is a feature for a locator.

### 2. Store/attribute data source

1. **Places API (Google/Radar/etc.):** real data, zero seeding. Cons: no
   API knows "has a men's department" — attribute coverage is exactly the
   part a franchise locator adds over consumer maps; vendor ToS require
   their data to render on their map (kills the Week F map-swap story);
   non-deterministic responses break the eval harness.
2. **First-party seeded dataset:** one fictional brand, ~75 stores, rich
   attributes, deterministic seed. Cons: it's synthetic. Pros: full
   attribute control, no ToS coupling, reproducible demos and evals —
   and it mirrors how real franchise clients actually work (they supply
   their own store data; the locator never sources stores from a Places
   API).

### 3. Attribute storage (the columns / jsonb / join-table argument)

1. **One typed column per attribute** (`has_mens_department boolean`, …).
   Pros: fully typed end to end, trivial `WHERE` clauses, partial indexes.
   Cons: every new attribute is a schema migration; real catalogs run
   40–100+ attributes that churn seasonally, so the schema becomes a config
   file under migration pressure; nothing enumerable at runtime — the UI
   filter list and the AI's allowed-values list must be maintained as a
   parallel hardcoded list that drifts.
2. **`jsonb` blob** (`attributes @> '{"mens_department": true}'`).
   Pros: no migrations, one GIN index, handles sparse/heterogeneous data.
   Cons: no referential integrity — a typo'd key doesn't error, it silently
   matches zero stores, which is the worst failure mode a locator has
   (looks like "no results near you"); still no authoritative catalog to
   enumerate, so the closed vocabulary the AI needs lives somewhere else
   and drifts; per-attribute analytics and admin tooling get ugly.
3. **Attribute catalog + join table** (`attributes` +
   `store_attributes(store_id, attribute_id)`).
   Pros: the catalog is *data, not schema* — adding "EV charging" is an
   `INSERT`, which matches how franchise merchandising actually operates;
   foreign keys make unknown attributes unrepresentable; one source of
   truth feeds all three consumers (the seed, the AI tool schema's enum of
   valid slugs, the UI filter chips) so they cannot drift; standard
   relational-division queries are indexable. Cons: "must have all N"
   filters need `EXISTS` per attribute or `GROUP BY … HAVING count`,
   more verbose than a boolean column; value-bearing attributes (beyond
   presence/absence) would need a value column later.

## Decision

- **AI is a query translator, not an answer generator.** One forced tool
  call: NL → typed `SearchQuery`. The database answers; the UI renders
  deterministically.
- **First-party seeded data** in Supabase Postgres with PostGIS.
- **Attribute catalog + join table** (option 3) for amenity/department/
  service attributes. Intrinsic per-store facts stay as typed columns on
  `stores` (name, address, phone, IANA `timezone`); **hours get their own
  `store_hours` table** (`day_of_week`, `opens_at`, `closes_at`; a closed
  day is an absent row) because "open now" is a first-class query and a
  chain spanning time zones needs per-store timezone math, not a text blob.
- **Geo:** stores carry plain `latitude`/`longitude` doubles (what
  geocoding produces, easy to read back) plus a **stored generated
  `geography(Point, 4326)` column** with a GiST index. Radius search uses
  `ST_DWithin` on geography (meters on the spheroid, no projection
  gotchas), and the ORM never has to round-trip PostGIS binary — the
  generated column is write-free.
- **Fictional brand: "Cedar & Main Outfitters"** — a mid-size apparel &
  outdoor chain across 4 Midwest metros (Columbus, Cincinnati,
  Indianapolis, Chicago; two time zones, which exercises the timezone
  column). Plausible catalog: departments (men's, women's, kids, footwear,
  outdoor), services (curbside pickup, alterations, BOPIS), parking and
  accessibility amenities.

## Consequences

- The AI layer (Week B) gets a closed vocabulary for free: the tool
  schema's attribute enum is generated from the `attributes` table, so
  model, DB, and UI can't disagree about what's filterable — and Week E's
  eval scorers compare typed fields, never prose.
- Adding an attribute is a seed-data change, not a migration; the demo
  story "your client's catalog is configuration" falls out of the schema.
- We accept join-table query verbosity; `lib/search` owns the
  relational-division SQL in exactly one place.
- Presence-only attributes are a simplification (real catalogs have
  value-bearing ones like `parking: valet`); the category field on the
  catalog leaves room, and the limitation is documented pitch-honestly.
- The generated geography column ties us to PostGIS (fine — it's the
  point) and means lat/lng edits automatically reindex.
