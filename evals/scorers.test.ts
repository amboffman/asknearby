import { describe, expect, it } from "vitest";

import { searchQuerySchema } from "@/lib/types/search-query";

import { scoreAttributes, scoreCase, scorePlaceName, scoreRadius } from "./scorers";

const q = (partial: unknown) => searchQuerySchema.parse(partial);

describe("scoreAttributes", () => {
  it("is order-independent set equality", () => {
    expect(scoreAttributes(["a", "b"], ["b", "a"])).toBe(true);
    expect(scoreAttributes(["a"], ["a", "b"])).toBe(false);
    expect(scoreAttributes(["a", "b"], ["a"])).toBe(false);
    expect(scoreAttributes([], [])).toBe(true);
  });
});

describe("scorePlaceName", () => {
  const place = (name: string) => q({ geo: { kind: "place", placeName: name } }).geo;

  it("matches when one normalized name contains the other", () => {
    expect(scorePlaceName(place("Columbus"), place("downtown Columbus, Ohio"))).toBe(true);
    expect(scorePlaceName(place("Dublin Ohio"), place("Dublin"))).toBe(true);
    expect(scorePlaceName(place("Columbus"), place("Cincinnati"))).toBe(false);
  });

  it("defers to geoKind when either side is not a place", () => {
    expect(scorePlaceName(q({}).geo, place("Columbus"))).toBe(true);
  });
});

describe("scoreRadius", () => {
  it("passes only when both absent or within 15%", () => {
    expect(scoreRadius(undefined, undefined)).toBe(true);
    expect(scoreRadius(undefined, 5)).toBe(false);
    expect(scoreRadius(16.1, 16)).toBe(true); // miles-conversion rounding
    expect(scoreRadius(5, 10)).toBe(false);
  });
});

describe("scoreCase", () => {
  const expected = q({
    attributeSlugs: ["mens-department", "free-parking"],
    geo: { kind: "place", placeName: "Columbus" },
  });

  it("passes an equivalent query", () => {
    const actual = q({
      attributeSlugs: ["free-parking", "mens-department"],
      geo: { kind: "place", placeName: "Columbus, OH" },
    });
    expect(scoreCase(expected, actual)).toEqual({
      pass: true,
      fields: {
        attributes: true,
        geoKind: true,
        placeName: true,
        radius: true,
        openNow: true,
      },
    });
  });

  it("fails per-field and overall on a wrong attribute set", () => {
    const actual = q({
      attributeSlugs: ["mens-department"],
      geo: { kind: "place", placeName: "Columbus" },
    });
    const score = scoreCase(expected, actual);
    expect(score.pass).toBe(false);
    expect(score.fields.attributes).toBe(false);
    expect(score.fields.geoKind).toBe(true);
  });

  it("catches invented openNow and wrong geo kind", () => {
    const actual = q({ attributeSlugs: ["mens-department", "free-parking"], openNow: true });
    const score = scoreCase(expected, actual);
    expect(score.fields.openNow).toBe(false);
    expect(score.fields.geoKind).toBe(false);
    // placeName defers: kind mismatch is geoKind's failure, not placeName's.
    expect(score.fields.placeName).toBe(true);
  });
});
