// Pure viewport math shared by map implementations (unit-tested; no
// vendor SDK types allowed here).
import { type Coordinates } from "@/lib/types/geo";

import { type StoreMapMarker, type StoreMapSearchArea } from "./types";

export interface BoundsBox {
  south: number;
  /** `east < west` means the box crosses the antimeridian (±180°). */
  west: number;
  north: number;
  east: number;
}

/**
 * Smallest box containing all points, or null when there are none.
 *
 * Longitudes use the minimal covering interval, so a set straddling the
 * antimeridian (+179.9 and −179.9) yields the 0.2° span encoded as
 * `east < west`, not a world-spanning box. Google's LatLngBounds reads
 * that encoding natively; the MapLibre adapter unwraps east by +360.
 */
export function boundsOf(points: readonly Coordinates[]): BoundsBox | null {
  const first = points[0];
  if (!first) return null;
  let south = first.latitude;
  let north = first.latitude;
  for (const point of points) {
    south = Math.min(south, point.latitude);
    north = Math.max(north, point.latitude);
  }
  const { west, east } = minimalLongitudeInterval(points.map((p) => p.longitude));
  return { south, west, north, east };
}

/**
 * The shortest longitudinal interval covering all values: sort unique
 * longitudes, find the largest gap between neighbors (including the wrap
 * gap from the last back to the first + 360°); the interval is that gap's
 * complement. When the largest gap is the wrap gap this reduces to plain
 * min/max; otherwise the result crosses ±180° and `east < west`.
 */
function minimalLongitudeInterval(longitudes: number[]): { west: number; east: number } {
  const unique = [...new Set(longitudes)].sort((a, b) => a - b);
  const last = unique.length - 1;
  if (last === 0) return { west: unique[0]!, east: unique[0]! };

  let gapEndIndex = 0; // gap defaults to the wrap-around: unique[last] → unique[0]
  let maxGap = unique[0]! + 360 - unique[last]!;
  for (let i = 1; i < unique.length; i++) {
    const gap = unique[i]! - unique[i - 1]!;
    if (gap > maxGap) {
      maxGap = gap;
      gapEndIndex = i;
    }
  }
  // The covering interval starts where the largest gap ends.
  return gapEndIndex === 0
    ? { west: unique[0]!, east: unique[last]! }
    : { west: unique[gapEndIndex]!, east: unique[gapEndIndex - 1]! };
}

// WGS84 small-area approximations: one degree of latitude, and one degree
// of longitude at the equator, in kilometers. Good to well under 1% at
// viewport scale, which is all camera framing needs.
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LNG_EQUATOR = 111.32;

function kmPerDegLng(latitude: number): number {
  return KM_PER_DEG_LNG_EQUATOR * Math.cos((latitude * Math.PI) / 180);
}

/** Normalize a longitude into [-180, 180). */
function wrapLng(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

/**
 * The box a radius circle fits inside: how a zero-result search frames
 * "we looked exactly here". Latitude clamps at the poles; a longitude span
 * reaching half the globe degrades to a full wrap (west = -180, east = 180)
 * rather than producing a nonsense crossing.
 */
export function circleBounds(center: Coordinates, radiusKm: number): BoundsBox {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const south = Math.max(-90, center.latitude - dLat);
  const north = Math.min(90, center.latitude + dLat);
  // Width at the circle's widest latitude (the pole-nearest edge), so the
  // box truly contains the circle instead of clipping its corners.
  const widestLat = Math.max(Math.abs(south), Math.abs(north));
  const perDeg = kmPerDegLng(widestLat);
  const dLng = perDeg > 0 ? radiusKm / perDeg : 180;
  if (dLng >= 180) return { south, north, west: -180, east: 180 };
  return {
    south,
    north,
    west: wrapLng(center.longitude - dLng),
    east: wrapLng(center.longitude + dLng),
  };
}

/** Longitudinal span of a box in degrees, honoring the east < west encoding. */
function lngSpan(box: BoundsBox): number {
  return box.east >= box.west ? box.east - box.west : box.east + 360 - box.west;
}

/**
 * Grow a box (in place around its center) until both axes span at least
 * `minKm`: fitBounds on a near-degenerate box (a lone store beside the
 * searched center) would otherwise zoom to rooftop level. No-op for boxes
 * already larger.
 */
export function ensureMinSpan(box: BoundsBox, minKm: number): BoundsBox {
  let { south, north, west, east } = box;

  const latSpanKm = (north - south) * KM_PER_DEG_LAT;
  if (latSpanKm < minKm) {
    const grow = (minKm - latSpanKm) / KM_PER_DEG_LAT / 2;
    south = Math.max(-90, south - grow);
    north = Math.min(90, north + grow);
  }

  const midLat = (south + north) / 2;
  const perDeg = kmPerDegLng(midLat);
  const spanDeg = lngSpan({ south, north, west, east });
  if (perDeg > 0 && spanDeg * perDeg < minKm) {
    const grow = Math.min(180 - spanDeg / 2, (minKm / perDeg - spanDeg) / 2);
    west = wrapLng(west - grow);
    east = wrapLng(east + grow);
  }
  return { south, north, west, east };
}

/**
 * What the camera should do for a given scene (ADR-006), computed once
 * here so both vendor adapters follow the same policy:
 *
 * - Zero results with a searched area: frame the search radius around the
 *   center. The empty map over the searched place IS the answer.
 * - Results with a searched area: frame results plus the center (results
 *   sit inside the radius, so this never explodes the zoom).
 * - No searched area (browsing, or a search without a place): frame the
 *   markers, plus the you-are-here dot when "Near me" is armed, so arming
 *   it visibly reframes even before a search runs.
 */
export type CameraPlan =
  { kind: "none" } | { kind: "point"; center: Coordinates } | { kind: "bounds"; box: BoundsBox };

const MIN_SPAN_KM = 2;

export function planCamera(scene: {
  markers: readonly StoreMapMarker[];
  searchArea?: StoreMapSearchArea | null;
  userLocation?: Coordinates | null;
}): CameraPlan {
  const { markers, searchArea, userLocation } = scene;
  if (searchArea && markers.length === 0) {
    return { kind: "bounds", box: circleBounds(searchArea.center, searchArea.radiusKm) };
  }

  const points: Coordinates[] = markers.map((m) => ({
    latitude: m.latitude,
    longitude: m.longitude,
  }));
  if (searchArea) points.push(searchArea.center);
  else if (userLocation) points.push(userLocation);

  const unique = [...new Map(points.map((p) => [`${p.latitude},${p.longitude}`, p])).values()];
  if (unique.length === 0) return { kind: "none" };
  if (unique.length === 1) return { kind: "point", center: unique[0]! };
  return { kind: "bounds", box: ensureMinSpan(boundsOf(unique)!, MIN_SPAN_KM) };
}

/**
 * Stable identity for a marker set's geometry: implementations refit the
 * viewport only when this changes (not on hover/selection re-renders).
 */
export function markersGeometryKey(markers: readonly StoreMapMarker[]): string {
  return markers.map((m) => `${m.id}:${m.latitude},${m.longitude}`).join("|");
}

/** Refit identity for the whole scene planCamera sees, same contract. */
export function cameraKey(scene: {
  markers: readonly StoreMapMarker[];
  searchArea?: StoreMapSearchArea | null;
  userLocation?: Coordinates | null;
}): string {
  const { markers, searchArea, userLocation } = scene;
  const search = searchArea
    ? `${searchArea.center.latitude},${searchArea.center.longitude},${searchArea.radiusKm}`
    : "";
  const user = userLocation ? `${userLocation.latitude},${userLocation.longitude}` : "";
  return `${markersGeometryKey(markers)}#${search}#${user}`;
}
