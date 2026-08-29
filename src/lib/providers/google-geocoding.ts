// Google adapter for GeocodingPort: Geocoding API v4 (v3 /maps/api/geocode
// is legacy as of 2026). Pure I/O translation per the AGENTS.md boundary.
import { type Coordinates } from "@/lib/types/geo";

import { type GeocodingPort } from "./geocoding";

const ENDPOINT = "https://geocode.googleapis.com/v4/geocode/address";

export class GeocodingRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Geocoding request failed (HTTP ${status}): ${message}`);
    this.name = "GeocodingRequestError";
  }
}

export interface GoogleGeocoderOptions {
  /** Server-side key (API-restricted to the Geocoding API, quota-capped). */
  apiKey: string;
  /** CLDR region bias; the demo dataset is US-only. */
  regionCode?: string;
  /** Injected for fixture tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
  /**
   * Abort the request after this long. Without it a hung upstream holds
   * the serverless invocation to the platform limit, and the gazetteer
   * fallback (which only fires on rejection) never gets its turn.
   */
  timeoutMs?: number;
}

interface GeocodeV4Response {
  results?: Array<{
    location?: { latitude: number; longitude: number };
  }>;
  error?: { message?: string; status?: string };
}

export function createGoogleGeocoder(options: GoogleGeocoderOptions): GeocodingPort {
  const { apiKey, regionCode = "US", fetchFn = fetch, timeoutMs = 5_000 } = options;

  return {
    async geocode(placeName: string): Promise<Coordinates | null> {
      const url = `${ENDPOINT}/${encodeURIComponent(placeName)}?regionCode=${encodeURIComponent(regionCode)}`;
      const response = await fetchFn(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "X-Goog-Api-Key": apiKey,
          // Only the coordinates are needed; keeps responses tiny.
          "X-Goog-FieldMask": "results.location",
        },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as GeocodeV4Response;
        throw new GeocodingRequestError(
          response.status,
          body.error?.message ?? response.statusText,
        );
      }

      const body = (await response.json()) as GeocodeV4Response;
      const location = body.results?.[0]?.location;
      if (
        !location ||
        typeof location.latitude !== "number" ||
        typeof location.longitude !== "number"
      ) {
        return null;
      }
      return { latitude: location.latitude, longitude: location.longitude };
    },
  };
}
