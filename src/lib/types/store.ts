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
  /**
   * Weekly hours, attached by the search API for the list's open/closed
   * status line (computed client-side in the store's own timezone).
   */
  hours?: StoreHoursEntry[];
}

export interface StoreHoursEntry {
  /** 0 = Sunday … 6 = Saturday; a closed day has no entry. */
  dayOfWeek: number;
  /** "HH:MM" 24-hour local time. */
  opensAt: string;
  closesAt: string;
}

export interface StoreDetails extends Store {
  attributes: Attribute[];
  hours: StoreHoursEntry[];
}
