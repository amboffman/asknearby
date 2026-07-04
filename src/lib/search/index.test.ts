import { describe, expect, it } from "vitest";

import { searchQuerySchema } from "@/lib/types/search-query";

import { buildFindStoresFilters } from "./index";

const now = new Date("2026-07-08T17:00:00Z");
const columbus = { latitude: 39.96, longitude: -83.0 };

function query(input: unknown) {
  return searchQuerySchema.parse(input);
}

describe("buildFindStoresFilters", () => {
  it("maps an empty query to no filters", () => {
    expect(buildFindStoresFilters(query({}), null, now)).toEqual({});
  });

  it("passes attribute slugs through", () => {
    const filters = buildFindStoresFilters(
      query({ attributeSlugs: ["mens-department", "free-parking"] }),
      null,
      now,
    );
    expect(filters.requiredAttributeSlugs).toEqual(["mens-department", "free-parking"]);
  });

  it("applies the default radius when a center is resolved", () => {
    const filters = buildFindStoresFilters(query({}), columbus, now);
    expect(filters.near).toEqual({ ...columbus, radiusMeters: 25_000 });
  });

  it("honors an explicit radius in km", () => {
    const filters = buildFindStoresFilters(query({ radiusKm: 5 }), columbus, now);
    expect(filters.near?.radiusMeters).toBe(5_000);
  });

  it("clamps out-of-band radii instead of trusting the model", () => {
    // Bypass the schema deliberately: defense in depth for values that
    // arrive from other callers (e.g. URL params later).
    const q = { ...query({}), radiusKm: 100_000 };
    // Clamped to RADIUS_KM.max (100 km) = 100,000 m.
    expect(buildFindStoresFilters(q, columbus, now).near?.radiusMeters).toBe(100_000);
  });

  it("ignores the radius when no center resolved", () => {
    const filters = buildFindStoresFilters(query({ radiusKm: 5 }), null, now);
    expect(filters.near).toBeUndefined();
  });

  it("maps openNow to the pinned clock instant", () => {
    expect(buildFindStoresFilters(query({ openNow: true }), null, now).openAt).toBe(now);
    expect(buildFindStoresFilters(query({}), null, now).openAt).toBeUndefined();
  });
});
