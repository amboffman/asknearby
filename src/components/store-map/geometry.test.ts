import { describe, expect, it } from "vitest";

import { boundsOf, markersGeometryKey } from "./geometry";

const marker = (id: number, latitude: number, longitude: number) => ({
  id,
  slug: `store-${id}`,
  name: `Store ${id}`,
  latitude,
  longitude,
});

describe("boundsOf", () => {
  it("returns null for no markers", () => {
    expect(boundsOf([])).toBeNull();
  });

  it("collapses to a point for a single marker", () => {
    expect(boundsOf([marker(1, 39.9, -83.0)])).toEqual({
      south: 39.9,
      north: 39.9,
      west: -83.0,
      east: -83.0,
    });
  });

  it("spans all markers", () => {
    const box = boundsOf([marker(1, 39.9, -83.0), marker(2, 41.8, -87.6), marker(3, 39.1, -84.5)]);
    expect(box).toEqual({ south: 39.1, north: 41.8, west: -87.6, east: -83.0 });
  });
});

describe("markersGeometryKey", () => {
  it("is stable for identical geometry and changes when it moves", () => {
    const a = [marker(1, 39.9, -83.0), marker(2, 41.8, -87.6)];
    expect(markersGeometryKey(a)).toBe(markersGeometryKey([...a]));
    expect(markersGeometryKey(a)).not.toBe(
      markersGeometryKey([marker(1, 39.9, -83.0), marker(2, 41.9, -87.6)]),
    );
  });
});
