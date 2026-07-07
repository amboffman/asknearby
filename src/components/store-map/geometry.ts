// Pure viewport math shared by map implementations (unit-tested; no
// vendor SDK types allowed here).
import { type StoreMapMarker } from "./types";

export interface BoundsBox {
  south: number;
  /** `east < west` means the box crosses the antimeridian (±180°). */
  west: number;
  north: number;
  east: number;
}

/**
 * Smallest box containing all markers, or null when there are none.
 *
 * Longitudes use the minimal covering interval, so a set straddling the
 * antimeridian (+179.9 and −179.9) yields the 0.2° span encoded as
 * `east < west` — not a world-spanning box. Google's LatLngBounds reads
 * that encoding natively; the MapLibre adapter unwraps east by +360.
 */
export function boundsOf(markers: readonly StoreMapMarker[]): BoundsBox | null {
  const first = markers[0];
  if (!first) return null;
  let south = first.latitude;
  let north = first.latitude;
  for (const marker of markers) {
    south = Math.min(south, marker.latitude);
    north = Math.max(north, marker.latitude);
  }
  const { west, east } = minimalLongitudeInterval(markers.map((m) => m.longitude));
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

/**
 * Stable identity for a marker set's geometry — implementations refit the
 * viewport only when this changes (not on hover/selection re-renders).
 */
export function markersGeometryKey(markers: readonly StoreMapMarker[]): string {
  return markers.map((m) => `${m.id}:${m.latitude},${m.longitude}`).join("|");
}
