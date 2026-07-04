import { describe, expect, it } from "vitest";

import { buildSearchQueryToolSchema, searchQuerySchema, toSearchQuery } from "./search-query";

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

describe("buildSearchQueryToolSchema", () => {
  const schema = buildSearchQueryToolSchema(["mens-department", "free-parking"]);

  it("accepts catalog slugs and rejects invented ones", () => {
    expect(schema.parse({ attributeSlugs: ["mens-department"] }).attributeSlugs).toEqual([
      "mens-department",
    ]);

    expect(schema.safeParse({ attributeSlugs: ["heliport"] }).success).toBe(false);
  });

  it("uses flat geo fields on the wire (model-friendly shape)", () => {
    const wire = schema.parse({ placeName: "Columbus", radiusKm: 5 });
    expect(wire.placeName).toBe("Columbus");
    expect(wire.latitude).toBeUndefined();
  });

  it("requires a non-empty catalog", () => {
    expect(() => buildSearchQueryToolSchema([])).toThrow(/non-empty catalog/);
  });
});

describe("toSearchQuery", () => {
  const schema = buildSearchQueryToolSchema(["mens-department"]);

  it("lifts a place name into a place intent", () => {
    const query = toSearchQuery(schema.parse({ placeName: "Columbus" }));
    expect(query.geo).toEqual({ kind: "place", placeName: "Columbus" });
  });

  it("prefers explicit coordinates over a place name", () => {
    const query = toSearchQuery(
      schema.parse({ placeName: "Columbus", latitude: 39.96, longitude: -83.0 }),
    );
    expect(query.geo).toEqual({
      kind: "coordinates",
      latitude: 39.96,
      longitude: -83.0,
    });
  });

  it("treats a lone latitude as no usable coordinates", () => {
    const query = toSearchQuery(schema.parse({ latitude: 39.96 }));
    expect(query.geo).toEqual({ kind: "none" });
  });

  it("maps an empty wire object to the default SearchQuery", () => {
    expect(toSearchQuery(schema.parse({}))).toEqual(searchQuerySchema.parse({}));
  });
});
