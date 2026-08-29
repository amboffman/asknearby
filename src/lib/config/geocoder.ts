// Composition root for geocoding: the one place allowed to know about
// env vars, seed data, AND provider adapters. Everything else depends on
// the GeocodingPort interface only.
import { METROS } from "@/lib/db/seed-data";
import {
  createGazetteerGeocoder,
  type GazetteerPlace,
  type GeocodingPort,
} from "@/lib/providers/geocoding";
import { createGoogleGeocoder } from "@/lib/providers/google-geocoding";

/** Seeded metro centroids: the offline fallback vocabulary. */
export function metroGazetteerPlaces(): GazetteerPlace[] {
  return METROS.map((metro) => ({
    name: metro.name,
    latitude: avg(metro.neighborhoods.map((n) => n.latitude)),
    longitude: avg(metro.neighborhoods.map((n) => n.longitude)),
  }));
}

function avg(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Primary-then-fallback chain; failures are logged, never fatal. */
function withFallback(primary: GeocodingPort, fallback: GeocodingPort): GeocodingPort {
  return {
    async geocode(placeName) {
      try {
        const result = await primary.geocode(placeName);
        if (result) return result;
      } catch (error) {
        console.error("Primary geocoder failed; using gazetteer:", error);
      }
      return fallback.geocode(placeName);
    },
  };
}

/**
 * Google when a server key is configured (with the gazetteer as safety
 * net), plain gazetteer otherwise, so dev works with zero Google setup.
 */
export function createAppGeocoder(): GeocodingPort {
  const gazetteer = createGazetteerGeocoder(metroGazetteerPlaces());
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return gazetteer;
  return withFallback(createGoogleGeocoder({ apiKey }), gazetteer);
}
