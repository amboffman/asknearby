import { describe, expect, it } from "vitest";

import { searchQuerySchema } from "@/lib/types/search-query";

import { applyUserLocation, buildFindStoresFilters } from "./index";

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

  it("dedupes attribute slugs (each one becomes an EXISTS subquery)", () => {
    const filters = buildFindStoresFilters(
      query({ attributeSlugs: ["free-parking", "free-parking", "mens-department"] }),
      null,
      now,
    );
    expect(filters.requiredAttributeSlugs).toEqual(["free-parking", "mens-department"]);
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

describe("applyUserLocation", () => {
  const user = { latitude: 40.0, longitude: -83.1 };

  it("fills in the user's coordinates when the sentence had no location", () => {
    const result = applyUserLocation(query({}), user);
    expect(result.geo).toEqual({ kind: "coordinates", ...user });
  });

  it("never overrides an explicit place or coordinates", () => {
    const place = query({ geo: { kind: "place", placeName: "Columbus" } });
    expect(applyUserLocation(place, user).geo).toEqual(place.geo);

    const coords = query({
      geo: { kind: "coordinates", latitude: 41.8, longitude: -87.6 },
    });
    expect(applyUserLocation(coords, user).geo).toEqual(coords.geo);
  });

  it("is a no-op without a user location", () => {
    const q = query({});
    expect(applyUserLocation(q, null)).toBe(q);
    expect(applyUserLocation(q, undefined)).toBe(q);
  });
});
