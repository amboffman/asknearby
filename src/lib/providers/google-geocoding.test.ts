import { describe, expect, it } from "vitest";

import { createGoogleGeocoder, GeocodingRequestError } from "./google-geocoding";

// Fixture mirroring the documented Geocoding API v4 response shape
// (results[].location.{latitude,longitude}).
const columbusFixture = {
  results: [
    {
      location: { latitude: 39.9611755, longitude: -82.9987942 },
      formattedAddress: "Columbus, OH, USA",
    },
  ],
};

function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { fetchFn, calls };
}

describe("createGoogleGeocoder", () => {
  it("resolves a place to coordinates from a v4 response", async () => {
    const { fetchFn } = stubFetch(200, columbusFixture);
    const geocoder = createGoogleGeocoder({ apiKey: "test-key", fetchFn });

    await expect(geocoder.geocode("Columbus")).resolves.toEqual({
      latitude: 39.9611755,
      longitude: -82.9987942,
    });
  });

  it("sends the v4 endpoint, API-key header, field mask, and region bias", async () => {
    const { fetchFn, calls } = stubFetch(200, columbusFixture);
    const geocoder = createGoogleGeocoder({ apiKey: "test-key", fetchFn });

    await geocoder.geocode("downtown Columbus, Ohio");

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toContain(
      "https://geocode.googleapis.com/v4/geocode/address/downtown%20Columbus%2C%20Ohio",
    );
    expect(url).toContain("regionCode=US");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-key");
    expect(headers["X-Goog-FieldMask"]).toBe("results.location");
  });

  it("returns null when there are no results", async () => {
    const { fetchFn } = stubFetch(200, {});
    const geocoder = createGoogleGeocoder({ apiKey: "test-key", fetchFn });

    await expect(geocoder.geocode("Nowhereville")).resolves.toBeNull();
    const empty = stubFetch(200, { results: [] });
    const geocoder2 = createGoogleGeocoder({
      apiKey: "test-key",
      fetchFn: empty.fetchFn,
    });
    await expect(geocoder2.geocode("Nowhereville")).resolves.toBeNull();
  });

  it("throws GeocodingRequestError with the API's message on HTTP errors", async () => {
    const { fetchFn } = stubFetch(403, {
      error: { message: "API key not authorized", status: "PERMISSION_DENIED" },
    });
    const geocoder = createGoogleGeocoder({ apiKey: "bad-key", fetchFn });

    await expect(geocoder.geocode("Columbus")).rejects.toThrow(/HTTP 403.*API key not authorized/);
    await expect(geocoder.geocode("Columbus")).rejects.toBeInstanceOf(GeocodingRequestError);
  });
});
