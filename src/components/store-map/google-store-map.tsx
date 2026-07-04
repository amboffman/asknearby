"use client";
// Google Maps JS implementation of the StoreMap contract, via
// @vis.gl/react-google-maps (the current Google-backed React wrapper).
import { AdvancedMarker, APIProvider, Map, Pin, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useMemo } from "react";

import { boundsOf, markersGeometryKey } from "./geometry";
import { type StoreMapMarker, type StoreMapProps } from "./types";

// Geographic center of the four seeded metros; shown before any search.
const INITIAL_CENTER = { lat: 40.5, lng: -85.5 };
const INITIAL_ZOOM = 6;

// AdvancedMarker requires a cloud-styled map. DEMO_MAP_ID is Google's
// documented placeholder; set a real Map ID in production.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? "DEMO_MAP_ID";

/** Refits the viewport when the marker geometry (not hover state) changes. */
function FitToMarkers({ markers }: { markers: StoreMapMarker[] }) {
  const map = useMap();
  const geometryKey = markersGeometryKey(markers);

  useEffect(() => {
    if (!map) return;
    const box = boundsOf(markers);
    if (!box) return;
    if (markers.length === 1) {
      map.setCenter({ lat: box.south, lng: box.west });
      map.setZoom(13);
      return;
    }
    map.fitBounds(
      new google.maps.LatLngBounds(
        { lat: box.south, lng: box.west },
        { lat: box.north, lng: box.east },
      ),
      48,
    );
    // Depends on geometryKey (the marker set's identity), deliberately not
    // on the markers array reference, so hover re-renders don't refit.
  }, [map, geometryKey]);

  return null;
}

export function GoogleStoreMap({
  markers,
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
      <div
        className={`flex items-center justify-center bg-neutral-100 text-sm text-neutral-500 ${className ?? ""}`}
      >
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to display the map.
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
          <FitToMarkers markers={markers} />
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
                  background={active ? "#b45309" : "#115e59"}
                  borderColor={active ? "#78350f" : "#134e4a"}
                  glyphColor="#ffffff"
                  scale={active ? 1.3 : 1}
                />
              </AdvancedMarker>
            );
          })}
        </Map>
      </APIProvider>
    </div>
  );
}
