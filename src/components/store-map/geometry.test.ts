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

  it("takes the short way around the antimeridian (east < west encodes the crossing)", () => {
    const box = boundsOf([marker(1, -16.5, 179.9), marker(2, -17.0, -179.9)])!;
    expect(box.west).toBe(179.9);
    expect(box.east).toBe(-179.9);
    // 0.2° of longitude, not the 359.8° a naive min/max would produce.
    expect((box.east + 360 - box.west) % 360).toBeCloseTo(0.2);
  });

  it("still uses plain min/max when the largest gap is at the wrap", () => {
    const box = boundsOf([marker(1, 0, -100), marker(2, 0, -60), marker(3, 0, -20)])!;
    expect(box.west).toBe(-100);
    expect(box.east).toBe(-20);
  });

  it("wraps even far from ±180 when that interval is genuinely shorter", () => {
    // Gaps: 170° (-170→0), 170° (0→170), 20° (wrap). Complement of the
    // largest gap crosses the antimeridian and covers 190°, beating the
    // naive min/max box of 340°.
    const box = boundsOf([marker(1, 0, -170), marker(2, 0, 0), marker(3, 0, 170)])!;
    expect(box.west).toBe(0);
    expect(box.east).toBe(-170);
  });

  it("collapses identical longitudes without inventing a span", () => {
    const box = boundsOf([marker(1, 10, 5), marker(2, 20, 5)])!;
    expect(box.west).toBe(5);
    expect(box.east).toBe(5);
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
