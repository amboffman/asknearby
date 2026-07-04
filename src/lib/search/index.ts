// lib/search — pure functions from SearchQuery to typed lib/db calls
// (AGENTS.md boundary: no AI, no HTTP; fully unit-testable). The only
// async dependency is the GeocodingPort, injected by the caller.
import { type Db, type FindStoresFilters, findStores } from "@/lib/db";
import { type GeocodingPort } from "@/lib/providers/geocoding";
import { RADIUS_KM, type SearchQuery } from "@/lib/types/search-query";
import { type Coordinates } from "@/lib/types/geo";
import { type StoreSearchResult } from "@/lib/types/store";

/**
 * Pure mapping: a SearchQuery plus an already-resolved center and a pinned
 * clock become lib/db filters. Radius defaults/clamping happen here so the
 * model never has to be trusted for it.
 */
export function buildFindStoresFilters(
  query: SearchQuery,
  center: Coordinates | null,
  now: Date,
): FindStoresFilters {
  const filters: FindStoresFilters = {};

  if (query.attributeSlugs.length > 0) {
    filters.requiredAttributeSlugs = [...query.attributeSlugs];
  }
  if (center) {
    const radiusKm = clamp(query.radiusKm ?? RADIUS_KM.default, RADIUS_KM.min, RADIUS_KM.max);
    filters.near = { ...center, radiusMeters: radiusKm * 1000 };
  }
  if (query.openNow) {
    filters.openAt = now;
  }
  return filters;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * "Near me" (Week D): when the sentence carried no location intent and the
 * browser shared the user's coordinates, search around the user. An
 * explicit place or coordinates in the sentence always wins.
 */
export function applyUserLocation(
  query: SearchQuery,
  userLocation: Coordinates | null | undefined,
): SearchQuery {
  if (!userLocation || query.geo.kind !== "none") return query;
  return {
    ...query,
    geo: { kind: "coordinates", ...userLocation },
  };
}

export interface SearchDeps {
  geocoder: GeocodingPort;
  /** Injected clock for deterministic tests; defaults to Date.now. */
  now?: () => Date;
}

export interface SearchOutcome {
  query: SearchQuery;
  stores: StoreSearchResult[];
  /**
   * Set when the user named a place the geocoder could not resolve; the
   * search then ran WITHOUT a location filter (Week D surfaces this).
   */
  unresolvedPlaceName?: string;
}

/** Resolve the query's geo intent to coordinates (or null). */
async function resolveCenter(
  query: SearchQuery,
  geocoder: GeocodingPort,
): Promise<{ center: Coordinates | null; unresolvedPlaceName?: string }> {
  switch (query.geo.kind) {
    case "coordinates":
      return {
        center: {
          latitude: query.geo.latitude,
          longitude: query.geo.longitude,
        },
      };
    case "place": {
      const center = await geocoder.geocode(query.geo.placeName);
      return center ? { center } : { center: null, unresolvedPlaceName: query.geo.placeName };
    }
    case "none":
      return { center: null };
  }
}

export async function searchStores(
  db: Db,
  query: SearchQuery,
  deps: SearchDeps,
): Promise<SearchOutcome> {
  const { center, unresolvedPlaceName } = await resolveCenter(query, deps.geocoder);
  const filters = buildFindStoresFilters(query, center, (deps.now ?? (() => new Date()))());
  const stores = await findStores(db, filters);
  return unresolvedPlaceName ? { query, stores, unresolvedPlaceName } : { query, stores };
}
