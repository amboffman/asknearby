// Pure viewport math shared by map implementations (unit-tested; no
// vendor SDK types allowed here).
import { type StoreMapMarker } from "./types";

export interface BoundsBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Smallest box containing all markers, or null when there are none.
 *
 * KNOWN LIMITATION: naive min/max longitude — a marker set straddling the
 * antimeridian (lon +179.9 and -179.9) produces a near-world-spanning box
 * instead of the short way around. Fine for the Midwest-US demo dataset;
 * a white-label dataset near ±180° needs wrap-aware bounds (both Google
 * LatLngBounds and MapLibre LngLatBounds accept east < west spans). See
 * docs/audit/2026-07-06-remaining-fixes.md.
 */
export function boundsOf(markers: readonly StoreMapMarker[]): BoundsBox | null {
  const first = markers[0];
  if (!first) return null;
  let south = first.latitude;
  let north = first.latitude;
  let west = first.longitude;
  let east = first.longitude;
  for (const marker of markers) {
    south = Math.min(south, marker.latitude);
    north = Math.max(north, marker.latitude);
    west = Math.min(west, marker.longitude);
    east = Math.max(east, marker.longitude);
  }
  return { south, west, north, east };
}

/**
 * Stable identity for a marker set's geometry — implementations refit the
 * viewport only when this changes (not on hover/selection re-renders).
 */
export function markersGeometryKey(markers: readonly StoreMapMarker[]): string {
  return markers.map((m) => `${m.id}:${m.latitude},${m.longitude}`).join("|");
}
