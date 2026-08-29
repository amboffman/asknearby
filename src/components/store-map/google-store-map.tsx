"use client";
// Google Maps JS implementation of the StoreMap contract, via
// @vis.gl/react-google-maps (the current Google-backed React wrapper).
import { AdvancedMarker, APIProvider, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";

import { cameraKey, planCamera } from "./geometry";
import { sameSpot, SearchedAreaGlyph, UserLocationGlyph } from "./glyphs";
import { type StoreMapProps } from "./types";

// Geographic center of the four seeded metros; shown before any search.
const INITIAL_CENTER = { lat: 40.5, lng: -85.5 };
const INITIAL_ZOOM = 6;

// AdvancedMarker requires a cloud-styled map. DEMO_MAP_ID is Google's
// documented placeholder; set a real Map ID in production.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

/** Executes the shared camera plan (ADR-006); same policy as MapLibre's. */
function FitCamera({
  markers,
  searchArea,
  userLocation,
}: Pick<StoreMapProps, "markers" | "searchArea" | "userLocation">) {
  const map = useMap();
  const sceneKey = cameraKey({ markers, searchArea, userLocation });

  useEffect(() => {
    if (!map) return;
    const plan = planCamera({ markers, searchArea, userLocation });
    if (plan.kind === "none") return;

    const apply = () => {
      if (plan.kind === "point") {
        map.setCenter({ lat: plan.center.latitude, lng: plan.center.longitude });
        map.setZoom(13);
        return;
      }
      // LatLngBounds(sw, ne) natively reads west > east as an antimeridian
      // crossing, matching boundsOf's east < west encoding.
      map.fitBounds(
        new google.maps.LatLngBounds(
          { lat: plan.box.south, lng: plan.box.west },
          { lat: plan.box.north, lng: plan.box.east },
        ),
        48,
      );
    };

    // A hidden pane (the mobile list view) gives the map a zero-size
    // container, where a fit computes a garbage zoom. Hold the plan until
    // the container actually has pixels.
    const container = map.getDiv();
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

export function GoogleStoreMap({
  markers,
  searchArea,
  userLocation,
  highlightedId,
  selectedId,
  onMarkerClick,
  onMarkerHoverChange,
  className,
}: StoreMapProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const activeIds = useMemo(
    () => new Set([highlightedId, selectedId].filter((id): id is number => id !== null)),
    [highlightedId, selectedId],
  );
  // Active markers last so they paint above their neighbors.
  const sortedMarkers = useMemo(
    () => [...markers].sort((a, b) => Number(activeIds.has(a.id)) - Number(activeIds.has(b.id))),
    [markers, activeIds],
  );

  if (!apiKey) {
    return (
      <div className={`flex items-center justify-center bg-cedar-50 p-6 ${className ?? ""}`}>
        <div className="max-w-sm space-y-2 rounded-xl border border-cedar-200 bg-white p-5 text-center shadow-sm">
          <p className="text-sm font-semibold text-cedar-950">Map key missing</p>
          <p className="text-sm text-neutral-600">
            Set{" "}
            <code className="font-mono text-xs text-cedar-800">
              NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
            </code>{" "}
            to render Google Maps — or flip{" "}
            <code className="font-mono text-xs text-cedar-800">
              NEXT_PUBLIC_MAPS_PROVIDER=maplibre
            </code>{" "}
            for the keyless adapter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={INITIAL_CENTER}
          defaultZoom={INITIAL_ZOOM}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
          className="h-full w-full"
        >
          <FitCamera markers={markers} searchArea={searchArea} userLocation={userLocation} />
          {/* Context anchors sit at zIndex 0 so store pins paint above.
              AdvancedMarker anchors content bottom-center; the translateY
              recenters the circular glyphs onto their coordinates. */}
          {userLocation && (
            <AdvancedMarker
              position={{ lat: userLocation.latitude, lng: userLocation.longitude }}
              title="Your location"
              zIndex={0}
            >
              <div style={{ transform: "translateY(50%)" }}>
                <UserLocationGlyph />
              </div>
            </AdvancedMarker>
          )}
          {searchArea && !(userLocation && sameSpot(searchArea.center, userLocation)) && (
            <AdvancedMarker
              position={{ lat: searchArea.center.latitude, lng: searchArea.center.longitude }}
              title={`Searched here: ${searchArea.label}`}
              zIndex={0}
            >
              <div style={{ transform: "translateY(50%)" }}>
                <SearchedAreaGlyph />
              </div>
            </AdvancedMarker>
          )}
          {sortedMarkers.map((marker) => {
            const active = activeIds.has(marker.id);
            return (
              <AdvancedMarker
                key={marker.id}
                position={{ lat: marker.latitude, lng: marker.longitude }}
                title={marker.name}
                zIndex={active ? 2 : 1}
                onClick={() => onMarkerClick(marker.id)}
                onMouseEnter={() => onMarkerHoverChange(marker.id)}
                onMouseLeave={() => onMarkerHoverChange(null)}
              >
                <Pin
                  background={active ? "#b45309" : "#0e4f45"}
                  borderColor={active ? "#78350f" : "#062c26"}
                  glyphColor="#ffffff"
                  // Numbered pins mirror the list rows; browse-mode pins
                  // (no ordinal) shrink into plain dots.
                  glyph={marker.ordinal !== undefined ? String(marker.ordinal) : undefined}
                  scale={marker.ordinal !== undefined ? (active ? 1.3 : 1) : active ? 1 : 0.7}
                />
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>
    </div>
  );
}
