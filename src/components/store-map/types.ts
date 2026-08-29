// The vendor-neutral <StoreMap/> contract (ADR-003, extended by ADR-006).
// Every map vendor implementation renders exactly this interface; swapping
// vendors is a config change, never a call-site change. Week F proves it
// with MapLibre.
import { type Coordinates } from "@/lib/types/geo";

export interface StoreMapMarker {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  /**
   * 1-based position in the result list; renders as a numbered pin that
   * mirrors the list row. Omitted in browse mode (unfiltered all-stores
   * view), which renders a smaller unnumbered pin.
   */
  ordinal?: number;
}

/**
 * Where the current search looked (ADR-006). Renders as a distinct
 * "searched here" marker, and when a search matches nothing the viewport
 * frames this area instead of staying wherever it was: an empty map over
 * the searched place is the honest "no stores here" answer.
 */
export interface StoreMapSearchArea {
  center: Coordinates;
  /** Effective search radius (the server default applied, never undefined). */
  radiusKm: number;
  /** Human place label for the marker tooltip ("San Diego", "your location"). */
  label: string;
}

export interface StoreMapProps {
  markers: StoreMapMarker[];
  /** Set after a located search; null while browsing or for searches with no place. */
  searchArea?: StoreMapSearchArea | null;
  /** Browser geolocation when "Near me" is armed; renders a you-are-here dot. */
  userLocation?: Coordinates | null;
  /** Store id under the pointer (map pin or list row); null when none. */
  highlightedId: number | null;
  /** Store id selected by click; null when none. */
  selectedId: number | null;
  onMarkerClick: (id: number) => void;
  onMarkerHoverChange: (id: number | null) => void;
  className?: string;
}
