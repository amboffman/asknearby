// The vendor seam: consumers import StoreMap from here and never from a
// vendor implementation. Week F adds a MapLibre implementation and a
// NEXT_PUBLIC_MAPS_PROVIDER switch at exactly this spot (ADR-003).
export { GoogleStoreMap as StoreMap } from "./google-store-map";
export { type StoreMapMarker, type StoreMapProps } from "./types";
