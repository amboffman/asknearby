"use client";
// MapLibre implementation of the StoreMap contract (Week F) — the proof
// that a maps-vendor swap is one adapter file. Tiles default to
// OpenFreeMap (keyless, production-permitted); point
// NEXT_PUBLIC_MAPLIBRE_STYLE_URL at Radar/Mapbox/MapTiler to change
// tile vendors without touching code.
import "maplibre-gl/dist/maplibre-gl.css";

import { Map, Marker, useMap } from "@vis.gl/react-maplibre";
import { useEffect, useMemo } from "react";

import { boundsOf, markersGeometryKey } from "./geometry";
import { type StoreMapMarker, type StoreMapProps } from "./types";

const STYLE_URL =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

// Same initial view as the Google implementation.
const INITIAL_VIEW = { longitude: -85.5, latitude: 40.5, zoom: 5.5 };

/** Same refit policy as the Google implementation: geometry key only. */
function FitToMarkers({ markers }: { markers: StoreMapMarker[] }) {
  const { current: map } = useMap();
  const geometryKey = markersGeometryKey(markers);

  useEffect(() => {
    if (!map) return;
    const box = boundsOf(markers);
    if (!box) return;
    if (markers.length === 1) {
      map.flyTo({ center: [box.west, box.south], zoom: 13 });
      return;
    }
    // east < west encodes an antimeridian crossing; MapLibre wants the
    // east edge unwrapped past +180 instead.
    const east = box.east < box.west ? box.east + 360 : box.east;
    map.fitBounds(
      [
        [box.west, box.south],
        [east, box.north],
      ],
      { padding: 48 },
    );
    // Keyed on geometry, not the array reference — hover re-renders must
    // not move the camera.
  }, [map, geometryKey]);

  return null;
}

/**
 * Teardrop pin visually matching the Google Pin colors. With an ordinal it
 * shows the list-row number; without one (browse mode) it's a smaller dot.
 */
function PinGlyph({ active, ordinal }: { active: boolean; ordinal?: number }) {
  const width = ordinal !== undefined ? (active ? 33 : 26) : active ? 26 : 20;
  const height = Math.round(width * (32 / 24));
  return (
    <svg width={width} height={height} viewBox="0 0 24 32" style={{ display: "block" }}>
      <path
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z"
        fill={active ? "#b45309" : "#0e4f45"}
        stroke={active ? "#78350f" : "#062c26"}
        strokeWidth="1"
      />
      {ordinal !== undefined ? (
        <text
          x="12"
          y="16"
          textAnchor="middle"
          fontFamily="system-ui, sans-serif"
          fontSize="11"
          fontWeight="700"
          fill="#ffffff"
        >
          {ordinal}
        </text>
      ) : (
        <circle cx="12" cy="12" r="4.5" fill="#ffffff" />
      )}
    </svg>
  );
}

export function MapLibreStoreMap({
  markers,
  highlightedId,
  selectedId,
  onMarkerClick,
  onMarkerHoverChange,
  className,
}: StoreMapProps) {
  const activeIds = useMemo(
    () => new Set([highlightedId, selectedId].filter((id): id is number => id !== null)),
    [highlightedId, selectedId],
  );
  // Active markers last so they paint above their neighbors.
  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => Number(activeIds.has(a.id)) - Number(activeIds.has(b.id))),
    [markers, activeIds],
  );

  return (
    <div className={className}>
      <Map
        initialViewState={INITIAL_VIEW}
        mapStyle={STYLE_URL}
        style={{ width: "100%", height: "100%" }}
      >
        <FitToMarkers markers={markers} />
        {sortedMarkers.map((marker) => (
          <Marker
            key={marker.id}
            longitude={marker.longitude}
            latitude={marker.latitude}
            anchor="bottom"
          >
            {/* A real button so keyboard users can focus and activate pins,
                matching the natively-focusable Google AdvancedMarkers. */}
            <button
              type="button"
              title={marker.name}
              aria-label={marker.name}
              onClick={() => onMarkerClick(marker.id)}
              onMouseEnter={() => onMarkerHoverChange(marker.id)}
              onMouseLeave={() => onMarkerHoverChange(null)}
              onFocus={() => onMarkerHoverChange(marker.id)}
              onBlur={() => onMarkerHoverChange(null)}
              style={{
                display: "block",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <PinGlyph active={activeIds.has(marker.id)} ordinal={marker.ordinal} />
            </button>
          </Marker>
        ))}
      </Map>
    </div>
  );
}
