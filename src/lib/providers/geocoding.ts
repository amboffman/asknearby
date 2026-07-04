// lib/providers — ports + adapters for maps vendors (AGENTS.md): pure I/O
// translation, no business logic. Week C adds the Google adapter behind
// this same port; the vendor swap is the pitch (ADR-003, forthcoming).
import { type Coordinates } from "@/lib/types/geo";

export interface GeocodingPort {
  /** Resolve a free-form place name to coordinates, or null if unknown. */
  geocode(placeName: string): Promise<Coordinates | null>;
}

export interface GazetteerPlace extends Coordinates {
  name: string;
  aliases?: readonly string[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deterministic offline geocoder over a fixed place list (the seeded metro
 * areas). Matches when a known place name appears as a word sequence in the
 * query ("downtown Columbus" → Columbus). Good enough for the Week B
 * terminal demo; real geocoding replaces it in Week C via the same port.
 */
export function createGazetteerGeocoder(places: readonly GazetteerPlace[]): GeocodingPort {
  const entries = places.flatMap((place) =>
    [place.name, ...(place.aliases ?? [])].map((name) => [normalize(name), place] as const),
  );

  return {
    geocode(placeName: string): Promise<Coordinates | null> {
      const query = ` ${normalize(placeName)} `;
      for (const [name, place] of entries) {
        if (name && query.includes(` ${name} `)) {
          return Promise.resolve({
            latitude: place.latitude,
            longitude: place.longitude,
          });
        }
      }
      return Promise.resolve(null);
    },
  };
}
