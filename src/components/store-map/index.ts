// The vendor seam (ADR-003): consumers import StoreMap from here, never
// from a vendor implementation. NEXT_PUBLIC_MAPS_PROVIDER picks the
// implementation at build time — the Week F demo is flipping this one
// env var and redeploying.
import { GoogleStoreMap } from "./google-store-map";
import { MapLibreStoreMap } from "./maplibre-store-map";

const provider = process.env.NEXT_PUBLIC_MAPS_PROVIDER ?? "google";

export const StoreMap = provider === "maplibre" ? MapLibreStoreMap : GoogleStoreMap;
export { type StoreMapMarker, type StoreMapProps } from "./types";
