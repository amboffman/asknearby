import { describe, expect, it } from "vitest";

import { createGazetteerGeocoder } from "./geocoding";

const geocoder = createGazetteerGeocoder([
  { name: "Columbus", latitude: 39.96, longitude: -83.0 },
  { name: "Chicago", aliases: ["Chi-Town"], latitude: 41.88, longitude: -87.63 },
]);

describe("createGazetteerGeocoder", () => {
  it("resolves an exact place name", async () => {
    await expect(geocoder.geocode("Columbus")).resolves.toEqual({
      latitude: 39.96,
      longitude: -83.0,
    });
  });

  it("resolves a place name inside a longer phrase, ignoring case and punctuation", async () => {
    await expect(geocoder.geocode("downtown COLUMBUS, Ohio")).resolves.toEqual({
      latitude: 39.96,
      longitude: -83.0,
    });
  });

  it("resolves aliases", async () => {
    await expect(geocoder.geocode("chi-town")).resolves.toEqual({
      latitude: 41.88,
      longitude: -87.63,
    });
  });

  it("does not match partial words", async () => {
    await expect(geocoder.geocode("Columbusville")).resolves.toBeNull();
  });

  it("returns null for unknown places", async () => {
    await expect(geocoder.geocode("Toledo")).resolves.toBeNull();
  });
});
