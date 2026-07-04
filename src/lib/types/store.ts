// Domain types that cross module boundaries (lib/db → lib/search → UI).
// Only shapes that more than one layer consumes belong here (AGENTS.md).

export type AttributeCategory = "department" | "service" | "amenity" | "parking";

export interface Attribute {
  slug: string;
  label: string;
  category: AttributeCategory;
}

export interface Store {
  id: number;
  slug: string;
  name: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  /** IANA timezone name, e.g. "America/Chicago". */
  timezone: string;
  latitude: number;
  longitude: number;
}

export interface StoreSearchResult extends Store {
  /** Meters from the search center; null when the search had no center. */
  distanceMeters: number | null;
}
