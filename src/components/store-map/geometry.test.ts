import { describe, expect, it } from "vitest";

import {
  boundsOf,
  cameraKey,
  circleBounds,
  ensureMinSpan,
  markersGeometryKey,
  planCamera,
} from "./geometry";

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

const KM_PER_DEG_LAT = 110.574;
const kmPerDegLng = (lat: number) => 111.32 * Math.cos((lat * Math.PI) / 180);

describe("circleBounds", () => {
  it("frames the radius symmetrically around a mid-latitude center", () => {
    const box = circleBounds({ latitude: 40, longitude: -83 }, 25);
    expect((box.north + box.south) / 2).toBeCloseTo(40, 6);
    expect((box.north - box.south) * KM_PER_DEG_LAT).toBeCloseTo(50, 3);
    expect((box.east + box.west) / 2).toBeCloseTo(-83, 6);
  });

  it("is wide enough for the circle at its pole-nearest edge, not just its center", () => {
    const box = circleBounds({ latitude: 60, longitude: 10 }, 50);
    // A circle's east-west extremes sit poleward of its center latitude,
    // where degrees of longitude are shorter; the box must cover that.
    const spanKmAtNorthEdge = (box.east - box.west) * kmPerDegLng(box.north);
    expect(spanKmAtNorthEdge).toBeCloseTo(100, 6);
  });

  it("wraps across the antimeridian with the east < west encoding", () => {
    const box = circleBounds({ latitude: 0, longitude: 179.9 }, 25);
    expect(box.east).toBeLessThan(box.west);
    expect(box.west).toBeCloseTo(179.9 - 25 / kmPerDegLng(box.north), 3);
  });

  it("clamps at the pole and degrades to a full longitude wrap", () => {
    const box = circleBounds({ latitude: 89.99, longitude: 0 }, 25);
    expect(box.north).toBe(90);
    expect(box.west).toBe(-180);
    expect(box.east).toBe(180);
  });
});

describe("ensureMinSpan", () => {
  it("leaves already-large boxes untouched", () => {
    const box = { south: 39, north: 41, west: -87, east: -83 };
    expect(ensureMinSpan(box, 2)).toEqual(box);
  });

  it("grows a degenerate box to the minimum span on both axes", () => {
    const grown = ensureMinSpan({ south: 40, north: 40, west: -83, east: -83 }, 2);
    expect((grown.north - grown.south) * KM_PER_DEG_LAT).toBeCloseTo(2, 3);
    expect((grown.east - grown.west) * kmPerDegLng(40)).toBeCloseTo(2, 3);
    expect((grown.north + grown.south) / 2).toBeCloseTo(40, 6);
    expect((grown.east + grown.west) / 2).toBeCloseTo(-83, 6);
  });
});

describe("planCamera", () => {
  const sanDiego = { latitude: 32.7157, longitude: -117.1611 };

  it("does nothing with no markers and no context", () => {
    expect(planCamera({ markers: [] })).toEqual({ kind: "none" });
  });

  it("frames the search radius when a located search matches nothing", () => {
    const plan = planCamera({
      markers: [],
      searchArea: { center: sanDiego, radiusKm: 25, label: "San Diego" },
    });
    expect(plan).toEqual({ kind: "bounds", box: circleBounds(sanDiego, 25) });
  });

  it("frames results plus the searched center when there are results", () => {
    const plan = planCamera({
      markers: [marker(1, 39.9, -83.0)],
      searchArea: { center: { latitude: 40.0, longitude: -83.2 }, radiusKm: 25, label: "Columbus" },
    });
    expect(plan.kind).toBe("bounds");
    if (plan.kind !== "bounds") throw new Error("unreachable");
    expect(plan.box.west).toBe(-83.2);
    expect(plan.box.north).toBe(40.0);
  });

  it("ignores the you-are-here dot once a search has an area of its own", () => {
    const near = planCamera({
      markers: [marker(1, 39.9, -83.0)],
      searchArea: { center: { latitude: 40.0, longitude: -83.2 }, radiusKm: 25, label: "Columbus" },
      userLocation: sanDiego,
    });
    expect(near.kind).toBe("bounds");
    if (near.kind !== "bounds") throw new Error("unreachable");
    expect(near.box.west).toBe(-83.2); // not stretched to San Diego
  });

  it("includes the you-are-here dot while browsing (arming Near me reframes)", () => {
    const plan = planCamera({
      markers: [marker(1, 39.9, -83.0), marker(2, 41.8, -87.6)],
      userLocation: sanDiego,
    });
    expect(plan.kind).toBe("bounds");
    if (plan.kind !== "bounds") throw new Error("unreachable");
    expect(plan.box.west).toBe(sanDiego.longitude);
    expect(plan.box.south).toBe(sanDiego.latitude);
  });

  it("keeps the single-point plan for one lone marker", () => {
    expect(planCamera({ markers: [marker(1, 39.9, -83.0)] })).toEqual({
      kind: "point",
      center: { latitude: 39.9, longitude: -83.0 },
    });
  });

  it("collapses a marker sitting exactly on the searched center to a point", () => {
    const plan = planCamera({
      markers: [marker(1, 40.0, -83.2)],
      searchArea: { center: { latitude: 40.0, longitude: -83.2 }, radiusKm: 25, label: "Columbus" },
    });
    expect(plan).toEqual({ kind: "point", center: { latitude: 40.0, longitude: -83.2 } });
  });

  it("pads a near-degenerate box (one store beside the center) to a usable zoom", () => {
    const plan = planCamera({
      markers: [marker(1, 40.0005, -83.2)],
      searchArea: { center: { latitude: 40.0, longitude: -83.2 }, radiusKm: 25, label: "Columbus" },
    });
    expect(plan.kind).toBe("bounds");
    if (plan.kind !== "bounds") throw new Error("unreachable");
    expect((plan.box.north - plan.box.south) * KM_PER_DEG_LAT).toBeGreaterThanOrEqual(2 - 1e-6);
  });
});

describe("cameraKey", () => {
  const markers = [marker(1, 39.9, -83.0)];
  const area = { center: { latitude: 40.0, longitude: -83.2 }, radiusKm: 25, label: "Columbus" };

  it("is stable across re-renders with identical scenes", () => {
    expect(cameraKey({ markers, searchArea: area })).toBe(
      cameraKey({ markers: [...markers], searchArea: { ...area } }),
    );
  });

  it("changes when the searched area or the you-are-here dot changes", () => {
    const base = cameraKey({ markers });
    expect(cameraKey({ markers, searchArea: area })).not.toBe(base);
    expect(cameraKey({ markers, userLocation: { latitude: 1, longitude: 2 } })).not.toBe(base);
  });

  it("does not change when only the area label changes", () => {
    expect(cameraKey({ markers, searchArea: area })).toBe(
      cameraKey({ markers, searchArea: { ...area, label: "elsewhere" } }),
    );
  });
});
