// The vendor-neutral <StoreMap/> contract (ADR-003). Every map vendor
// implementation renders exactly this interface; swapping vendors is a
// config change, never a call-site change. Week F proves it with MapLibre.

export interface StoreMapMarker {
  id: number;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface StoreMapProps {
  markers: StoreMapMarker[];
  /** Store id under the pointer (map pin or list row); null when none. */
  highlightedId: number | null;
  /** Store id selected by click; null when none. */
  selectedId: number | null;
  onMarkerClick: (id: number) => void;
  onMarkerHoverChange: (id: number | null) => void;
  className?: string;
}
