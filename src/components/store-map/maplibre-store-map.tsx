"use client";
// MapLibre implementation of the StoreMap contract (Week F): the proof
// that a maps-vendor swap is one adapter file. Tiles default to
// OpenFreeMap (keyless, production-permitted); point
// NEXT_PUBLIC_MAPLIBRE_STYLE_URL at Radar/Mapbox/MapTiler to change
// tile vendors without touching code.
import "maplibre-gl/dist/maplibre-gl.css";

import { Map, Marker, useMap } from "@vis.gl/react-maplibre";
import { useEffect, useMemo } from "react";

import { cameraKey, planCamera } from "./geometry";
import { sameSpot, SearchedAreaGlyph, UserLocationGlyph } from "./glyphs";
import { type StoreMapProps } from "./types";

const STYLE_URL =
  process.env.NEXT_PUBLIC_MAPLIBRE_STYLE_URL ?? "https://tiles.openfreemap.org/styles/liberty";

// Same initial view as the Google implementation.
const INITIAL_VIEW = { longitude: -85.5, latitude: 40.5, zoom: 5.5 };

/** Executes the shared camera plan (ADR-006); same policy as Google's. */
function FitCamera({
  markers,
  searchArea,
  userLocation,
}: Pick<StoreMapProps, "markers" | "searchArea" | "userLocation">) {
  const { current: map } = useMap();
  const sceneKey = cameraKey({ markers, searchArea, userLocation });

  useEffect(() => {
    if (!map) return;
    const plan = planCamera({ markers, searchArea, userLocation });
    if (plan.kind === "none") return;

    const apply = () => {
      if (plan.kind === "point") {
        map.flyTo({ center: [plan.center.longitude, plan.center.latitude], zoom: 13 });
        return;
      }
      // east < west encodes an antimeridian crossing; MapLibre wants the
      // east edge unwrapped past +180 instead.
      const east = plan.box.east < plan.box.west ? plan.box.east + 360 : plan.box.east;
      map.fitBounds(
        [
          [plan.box.west, plan.box.south],
          [east, plan.box.north],
        ],
        { padding: 48 },
      );
    };

    // A hidden pane (the mobile list view) gives the map a zero-size
    // container, where a fit computes a garbage zoom. Hold the plan until
    // the container actually has pixels.
    const container = map.getContainer();
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      const observer = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          observer.disconnect();
          apply();
        }
      });
      observer.observe(container);
      return () => observer.disconnect();
    }
    apply();
    // Keyed on the scene identity, not object references: hover
    // re-renders must not move the camera.
  }, [map, sceneKey]);

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
  searchArea,
  userLocation,
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
        <FitCamera markers={markers} searchArea={searchArea} userLocation={userLocation} />
        {/* Context anchors render before store pins so pins paint above. */}
        {userLocation && (
          <Marker
            longitude={userLocation.longitude}
            latitude={userLocation.latitude}
            anchor="center"
          >
            <div role="img" aria-label="Your location" title="Your location">
              <UserLocationGlyph />
            </div>
          </Marker>
        )}
        {searchArea && !(userLocation && sameSpot(searchArea.center, userLocation)) && (
          <Marker
            longitude={searchArea.center.longitude}
            latitude={searchArea.center.latitude}
            anchor="center"
          >
            <div
              role="img"
              aria-label={`Searched area: ${searchArea.label}`}
              title={`Searched here: ${searchArea.label}`}
            >
              <SearchedAreaGlyph />
            </div>
          </Marker>
        )}
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
