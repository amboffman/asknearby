# 003. The StoreMap contract and the ports/adapters layout

- **Status:** Accepted
- **Date:** 2026-07-04

## Context

The pitch audience builds franchise locators for clients who arrive
already committed to a maps vendor — contracts, billing credits, data
residency, corporate standards. "A client on vendor X costs one adapter"
is the core demo claim (Week F proves it live by swapping the map). Maps
touch this app on two surfaces with different lifetimes and runtimes:

1. **Server-side geocoding** (place name → coordinates) — an I/O call.
2. **Client-side map rendering** (pins, viewport, interactions) — a React
   component tree owned by the vendor's SDK.

## Options considered

1. **Use vendor components/SDKs directly at call sites.** Fastest to ship;
   vendor types leak into every page and handler, so a swap is a rewrite —
   exactly the failure mode the demo argues against.
2. **Adopt a cross-vendor map library as the abstraction.** No mature
   library spans Google Maps JS *and* MapLibre with one API; this trades a
   vendor lock for a wrapper lock plus the union of both vendors' quirks.
3. **Own thin contracts per surface; one adapter per vendor.** The
   interface is ours and sized to what the app needs, vendor types stay
   inside one file per vendor, and the swap seam is explicit and testable.

## Decision

Option 3, laid out as:

- **`lib/providers`** — vendor ports and adapters, pure I/O translation.
  `GeocodingPort` with two adapters: `createGoogleGeocoder` (Geocoding API
  **v4** — the `/maps/api/geocode` v3 surface is legacy in 2026;
  fixture-tested via injected fetch) and `createGazetteerGeocoder`
  (deterministic offline matcher over injected places).
- **`lib/config`** — the composition root, the only layer that reads env
  vars and wires adapters: Google-with-gazetteer-fallback when the server
  key exists (failures log loudly, degrade gracefully), gazetteer alone
  otherwise, so dev needs zero Google setup.
- **`components/store-map`** — the client-side equivalent of a port:
  a vendor-neutral `StoreMapProps` contract (markers, controlled
  `highlightedId`/`selectedId`, hover + click callbacks), one
  implementation per vendor (`google-store-map.tsx` today, MapLibre in
  Week F), and an `index.ts` seam where the `MAPS_PROVIDER` switch lands.
  Shared viewport math (`geometry.ts`) is pure, vendor-free, unit-tested.
- **Selection state lives in the page, not the map.** The map renders
  controlled props and emits events; hover/select semantics stay identical
  across vendors because no vendor owns them.

Vendor specifics recorded: the Google implementation uses
`@vis.gl/react-google-maps` (the current Google-backed React wrapper);
`AdvancedMarker` requires a cloud-styled `mapId` — `DEMO_MAP_ID` is
Google's documented placeholder and must become a real Map ID before the
pitch.

## Consequences

- Week F's MapLibre implementation is: implement `StoreMapProps` in one
  file, flip the `index.ts` seam by config. The eval of the claim is the
  diff size.
- The vendor lock-in surface is measurable: one adapter file per vendor
  per surface. That line is the pitch slide.
- The contract only carries what the app needs; vendor-exclusive features
  (Street View, cloud styling knobs) require growing the contract
  deliberately rather than leaking through it. Accepted trade.
- Geocoding degrades rather than fails (Google outage/misconfig → metro
  gazetteer → at worst an unresolved-place notice), which also keeps demos
  resilient to Cloud Console state.
