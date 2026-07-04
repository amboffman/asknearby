// Deterministic field-by-field scorers (Week E). No AI judges anywhere:
// two SearchQuery values in, booleans out. (Gym kata 1L.3 rebuilds these.)
import { type SearchQuery } from "@/lib/types/search-query";

export interface FieldScores {
  attributes: boolean;
  geoKind: boolean;
  placeName: boolean;
  radius: boolean;
  openNow: boolean;
}

export interface CaseScore {
  fields: FieldScores;
  /** Strict: every field correct. */
  pass: boolean;
}

export const FIELD_NAMES = [
  "attributes",
  "geoKind",
  "placeName",
  "radius",
  "openNow",
] as const satisfies ReadonlyArray<keyof FieldScores>;

function normalizePlace(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Set equality, order-independent. */
export function scoreAttributes(expected: readonly string[], actual: readonly string[]): boolean {
  if (expected.length !== actual.length) return false;
  const want = new Set(expected);
  return actual.every((slug) => want.has(slug));
}

/**
 * Place names match when one normalized name contains the other:
 * "Columbus" ≈ "Columbus Ohio" ≈ "downtown Columbus". Non-place intents
 * score true here (the kind mismatch is geoKind's job).
 */
export function scorePlaceName(expected: SearchQuery["geo"], actual: SearchQuery["geo"]): boolean {
  if (expected.kind !== "place" || actual.kind !== "place") return true;
  const want = normalizePlace(expected.placeName);
  const got = normalizePlace(actual.placeName);
  return want.includes(got) || got.includes(want);
}

/** Both absent, or within ±15% (tolerates unit-conversion rounding). */
export function scoreRadius(expected: number | undefined, actual: number | undefined): boolean {
  if (expected === undefined || actual === undefined) {
    return expected === actual;
  }
  return Math.abs(actual - expected) / expected <= 0.15;
}

export function scoreCase(expected: SearchQuery, actual: SearchQuery): CaseScore {
  const fields: FieldScores = {
    attributes: scoreAttributes(expected.attributeSlugs, actual.attributeSlugs),
    geoKind: expected.geo.kind === actual.geo.kind,
    placeName: scorePlaceName(expected.geo, actual.geo),
    radius: scoreRadius(expected.radiusKm, actual.radiusKm),
    openNow: expected.openNow === actual.openNow,
  };
  return { fields, pass: FIELD_NAMES.every((f) => fields[f]) };
}
