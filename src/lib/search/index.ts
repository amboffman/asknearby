// lib/search: pure functions from SearchQuery to typed lib/db calls
// (AGENTS.md boundary: no AI, no HTTP; fully unit-testable). The only
// async dependency is the GeocodingPort, injected by the caller.
import {
  countStores,
  countStoresPerAttribute,
  type Db,
  type FindStoresFilters,
  findStores,
  listHoursForStores,
  STORE_RESULT_LIMIT,
} from "@/lib/db";
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
    // Dedupe: each slug becomes its own EXISTS subquery in lib/db.
    filters.requiredAttributeSlugs = [...new Set(query.attributeSlugs)];
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

export interface NoResultsDiagnosis {
  /** Chain-wide store count per requested attribute (0 = filter matches nothing, ever). */
  attributeCounts: Array<{ slug: string; storeCount: number }>;
  /** Stores matching all non-geo filters anywhere in the chain. */
  matchesIgnoringLocation: number;
  /** Distance to the nearest such match, when the search had a center. */
  nearestDistanceMeters: number | null;
}

export interface SearchOutcome {
  query: SearchQuery;
  stores: StoreSearchResult[];
  /**
   * The resolved search center, when the query had one. Lets the UI's
   * query-chip edits re-run deterministically (geo as coordinates) without
   * paying for a second geocode (ADR-004).
   */
  center?: Coordinates;
  /**
   * Set when the user named a place the geocoder could not resolve; the
   * search then ran WITHOUT a location filter (Week D surfaces this).
   */
  unresolvedPlaceName?: string;
  /** Present only when zero stores matched: why, and what's closest. */
  noResults?: NoResultsDiagnosis;
  /**
   * Set when more stores matched than STORE_RESULT_LIMIT allows in one
   * response; the UI must not present the list as exhaustive.
   */
  truncated?: boolean;
}

/** Explain an empty result: which filters bite, and what's nearest. */
export async function diagnoseNoResults(
  db: Db,
  query: SearchQuery,
  center: Coordinates | null,
  now: Date,
): Promise<NoResultsDiagnosis> {
  const counts = await countStoresPerAttribute(db, query.attributeSlugs);
  const nonGeoFilters = buildFindStoresFilters(query, null, now);
  // COUNT(*), not a capped fetch: the true chain-wide number even when it
  // exceeds the result limit.
  const matchesIgnoringLocation = await countStores(db, nonGeoFilters);

  let nearestDistanceMeters: number | null = null;
  if (center && matchesIgnoringLocation > 0) {
    // `near` without radiusMeters sorts by distance without filtering.
    const [nearest] = await findStores(db, {
      ...nonGeoFilters,
      near: { ...center },
      limit: 1,
    });
    nearestDistanceMeters = nearest?.distanceMeters ?? null;
  }

  return {
    attributeCounts: query.attributeSlugs.map((slug) => ({
      slug,
      storeCount: counts[slug] ?? 0,
    })),
    matchesIgnoringLocation,
    nearestDistanceMeters,
  };
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
  const now = (deps.now ?? (() => new Date()))();
  const { center, unresolvedPlaceName } = await resolveCenter(query, deps.geocoder);
  const filters = buildFindStoresFilters(query, center, now);
  // Fetch one past the limit: an exactly-full page and a truncated one are
  // otherwise indistinguishable.
  const fetched = await findStores(db, { ...filters, limit: STORE_RESULT_LIMIT + 1 });
  const truncated = fetched.length > STORE_RESULT_LIMIT;
  const stores = truncated ? fetched.slice(0, STORE_RESULT_LIMIT) : fetched;

  const outcome: SearchOutcome = { query, stores };
  if (truncated) outcome.truncated = true;
  if (center) outcome.center = center;
  if (unresolvedPlaceName) outcome.unresolvedPlaceName = unresolvedPlaceName;
  if (stores.length === 0) {
    outcome.noResults = await diagnoseNoResults(db, query, center, now);
  }
  return outcome;
}

/**
 * Attach weekly hours to each result store (one extra query) so list rows
 * can render an open/closed status line. Kept out of searchStores so the
 * core spine stays hours-free; the API routes opt in.
 */
export async function attachStoreHours(db: Db, outcome: SearchOutcome): Promise<SearchOutcome> {
  if (outcome.stores.length === 0) return outcome;
  const hoursByStore = await listHoursForStores(
    db,
    outcome.stores.map((store) => store.id),
  );
  return {
    ...outcome,
    stores: outcome.stores.map((store) => ({
      ...store,
      hours: hoursByStore.get(store.id) ?? [],
    })),
  };
}
