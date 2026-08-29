import { describe, expect, it } from "vitest";

import { RADIUS_KM, type SearchQuery } from "@/lib/types/search-query";

import {
  attributeLabel,
  DEFAULT_RADIUS_KM,
  describeSearch,
  formatDistanceMiles,
  formatRadiusMiles,
  formatTime,
  openStatus,
} from "./format";

describe("formatTime", () => {
  it("formats whole hours without minutes", () => {
    expect(formatTime("09:00")).toBe("9 AM");
    expect(formatTime("21:00")).toBe("9 PM");
  });

  it("keeps minutes when present", () => {
    expect(formatTime("10:30")).toBe("10:30 AM");
    expect(formatTime("18:05")).toBe("6:05 PM");
  });

  it("handles noon and midnight", () => {
    expect(formatTime("12:00")).toBe("12 PM");
    expect(formatTime("00:00")).toBe("12 AM");
  });
});

describe("formatDistanceMiles", () => {
  it("uses one decimal up close", () => {
    expect(formatDistanceMiles(1609.344)).toBe("1.0 mi");
    expect(formatDistanceMiles(3379.6)).toBe("2.1 mi");
  });

  it("rounds to whole miles once far away", () => {
    expect(formatDistanceMiles(54_000)).toBe("34 mi");
  });
});

describe("attributeLabel", () => {
  it("returns the catalog label for known slugs", () => {
    expect(attributeLabel("mens-department")).toBe("Men's department");
    expect(attributeLabel("free-parking")).toBe("Free parking");
  });

  it("de-slugs unknown values instead of failing", () => {
    expect(attributeLabel("gift-wrap")).toBe("gift wrap");
  });
});

describe("formatRadiusMiles", () => {
  it("rounds to whole miles and never shows zero", () => {
    expect(formatRadiusMiles(25)).toBe("16 mi");
    expect(formatRadiusMiles(1)).toBe("1 mi");
  });
});

describe("describeSearch", () => {
  const query = (over: Partial<SearchQuery>): SearchQuery => ({
    attributeSlugs: [],
    geo: { kind: "none" },
    openNow: false,
    ...over,
  });

  it("keeps the display default in sync with the server default", () => {
    expect(DEFAULT_RADIUS_KM).toBe(RADIUS_KM.default);
  });

  it("restates every filter of a full query", () => {
    const q = query({
      attributeSlugs: ["free-parking", "mens-department"],
      geo: { kind: "place", placeName: "San Diego" },
      openNow: true,
    });
    expect(describeSearch(q, null)).toBe(
      "stores with Free parking and Men's department, open right now, within 16 mi of San Diego",
    );
  });

  it("lists three or more attributes with commas", () => {
    const q = query({ attributeSlugs: ["free-parking", "mens-department", "ev-charging"] });
    expect(describeSearch(q, null)).toMatch(/^stores with Free parking, Men's department, and /);
  });

  it("honors an explicit radius", () => {
    const q = query({ geo: { kind: "place", placeName: "Chicago" }, radiusKm: 5 });
    expect(describeSearch(q, null)).toBe("stores within 3 mi of Chicago");
  });

  it("names a near-me search as your location", () => {
    const q = query({ geo: { kind: "coordinates", latitude: 32.7, longitude: -117.2 } });
    expect(describeSearch(q, "you")).toBe("stores within 16 mi of your location");
  });

  it("keeps the place label a chip re-run swapped for coordinates", () => {
    const q = query({ geo: { kind: "coordinates", latitude: 39.9, longitude: -83.0 } });
    expect(describeSearch(q, "Columbus")).toBe("stores within 16 mi of Columbus");
  });

  it("drops the location clause when the place never geocoded", () => {
    const q = query({
      attributeSlugs: ["free-parking"],
      geo: { kind: "place", placeName: "Narnia" },
    });
    expect(describeSearch(q, null, "Narnia")).toBe("stores with Free parking");
  });

  it("degrades to all stores when nothing was filtered", () => {
    expect(describeSearch(query({}), null)).toBe("all stores");
  });
});

describe("openStatus", () => {
  // 2026-07-08 is a Wednesday; 17:00Z = 13:00 in New York (EDT, UTC-4)
  // and 12:00 in Chicago (CDT, UTC-5).
  const now = new Date("2026-07-08T17:00:00Z");
  const wednesday = { dayOfWeek: 3, opensAt: "10:00", closesAt: "21:00" };

  it("is open during today's window, in the store's timezone", () => {
    expect(openStatus([wednesday], "America/New_York", now)).toEqual({
      isOpen: true,
      detail: "closes 9 PM",
    });
  });

  it("is closed before opening, with today's opening time", () => {
    const lateOpen = { dayOfWeek: 3, opensAt: "13:00", closesAt: "21:00" };
    expect(openStatus([lateOpen], "America/Chicago", now)).toEqual({
      isOpen: false,
      detail: "opens 1 PM",
    });
  });

  it("names the next open day when closed today", () => {
    const thursday = { dayOfWeek: 4, opensAt: "10:00", closesAt: "21:00" };
    expect(openStatus([thursday], "America/New_York", now)).toEqual({
      isOpen: false,
      detail: "opens 10 AM Thu",
    });
  });

  it("handles a store with no hours at all", () => {
    expect(openStatus([], "America/New_York", now)).toEqual({
      isOpen: false,
      detail: null,
    });
  });
});
