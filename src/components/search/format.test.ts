import { describe, expect, it } from "vitest";

import { attributeLabel, formatDistanceMiles, formatTime, openStatus } from "./format";

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
