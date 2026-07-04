import { describe, expect, it } from "vitest";

import { buildSearchQuerySchema, searchQuerySchema } from "./search-query";

describe("searchQuerySchema", () => {
  it("fills defaults for an empty query", () => {
    const query = searchQuerySchema.parse({});

    expect(query).toEqual({
      attributeSlugs: [],
      geo: { kind: "none" },
      openNow: false,
    });
    expect(query.radiusKm).toBeUndefined();
  });

  it("parses the flagship demo query shape", () => {
    const query = searchQuerySchema.parse({
      attributeSlugs: ["mens-department", "free-parking"],
      geo: { kind: "place", placeName: "Columbus" },
    });

    expect(query.attributeSlugs).toEqual(["mens-department", "free-parking"]);
    expect(query.geo).toEqual({ kind: "place", placeName: "Columbus" });
  });

  it("accepts explicit coordinates and rejects out-of-range ones", () => {
    const geo = { kind: "coordinates", latitude: 39.96, longitude: -83.0 };
    expect(searchQuerySchema.parse({ geo }).geo).toEqual(geo);

    expect(searchQuerySchema.safeParse({ geo: { ...geo, latitude: 91 } }).success).toBe(false);
  });

  it("rejects a place intent without a place name", () => {
    const result = searchQuerySchema.safeParse({
      geo: { kind: "place", placeName: "" },
    });
    expect(result.success).toBe(false);
  });

  it("bounds the radius", () => {
    expect(searchQuerySchema.safeParse({ radiusKm: 0.5 }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ radiusKm: 101 }).success).toBe(false);
    expect(searchQuerySchema.parse({ radiusKm: 5 }).radiusKm).toBe(5);
  });
});

describe("buildSearchQuerySchema", () => {
  const schema = buildSearchQuerySchema(["mens-department", "free-parking"]);

  it("accepts catalog slugs and rejects invented ones", () => {
    expect(schema.parse({ attributeSlugs: ["mens-department"] }).attributeSlugs).toEqual([
      "mens-department",
    ]);

    expect(schema.safeParse({ attributeSlugs: ["heliport"] }).success).toBe(false);
  });

  it("produces the same defaults as the static schema", () => {
    expect(schema.parse({})).toEqual(searchQuerySchema.parse({}));
  });

  it("requires a non-empty catalog", () => {
    expect(() => buildSearchQuerySchema([])).toThrow(/non-empty catalog/);
  });
});
