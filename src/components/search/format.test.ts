import { describe, expect, it } from "vitest";

import { formatTime } from "./format";

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
