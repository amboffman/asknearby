import { afterEach, describe, expect, it, vi } from "vitest";

import { type Db, incrementUsageCounter } from "@/lib/db";

import { checkCostGuard, checkIpRateLimit, clientIpFrom, limitsFromEnv } from "./cost-guard";

vi.mock("@/lib/db", () => ({
  incrementUsageCounter: vi.fn(),
}));

const mockedIncrement = vi.mocked(incrementUsageCounter);
const db = {} as Db;

afterEach(() => {
  vi.unstubAllEnvs();
  mockedIncrement.mockReset();
});

describe("limitsFromEnv", () => {
  it("uses the defaults when the env vars are unset", () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", undefined);
    vi.stubEnv("DAILY_AI_REQUEST_BUDGET", undefined);
    expect(limitsFromEnv()).toEqual({ perIpPerMinute: 10, dailyBudget: 300 });
  });

  it("parses valid integers", () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "25");
    vi.stubEnv("DAILY_AI_REQUEST_BUDGET", "1000");
    expect(limitsFromEnv()).toEqual({ perIpPerMinute: 25, dailyBudget: 1000 });
  });

  it("falls back on garbage instead of failing open (NaN disables all > checks)", () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "ten");
    vi.stubEnv("DAILY_AI_REQUEST_BUDGET", "300req");
    expect(limitsFromEnv()).toEqual({ perIpPerMinute: 10, dailyBudget: 300 });
  });

  it("falls back on empty string and non-positive values instead of blocking everyone", () => {
    vi.stubEnv("RATE_LIMIT_PER_MINUTE", "");
    vi.stubEnv("DAILY_AI_REQUEST_BUDGET", "0");
    expect(limitsFromEnv()).toEqual({ perIpPerMinute: 10, dailyBudget: 300 });
  });
});

describe("clientIpFrom", () => {
  function requestWith(headers: Record<string, string>): Request {
    return new Request("http://localhost/api/search", { headers });
  }

  it("prefers the platform-set x-real-ip", () => {
    expect(
      clientIpFrom(requestWith({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" })),
    ).toBe("1.2.3.4");
  });

  it("falls back to the first x-forwarded-for hop, trimmed", () => {
    expect(clientIpFrom(requestWith({ "x-forwarded-for": " 5.6.7.8 , 9.9.9.9" }))).toBe("5.6.7.8");
  });

  it("collapses missing and empty headers to 'local'", () => {
    expect(clientIpFrom(requestWith({}))).toBe("local");
    expect(clientIpFrom(requestWith({ "x-forwarded-for": " , 9.9.9.9" }))).toBe("local");
  });

  it("collapses oversized values to 'local' rather than minting arbitrary counter keys", () => {
    expect(clientIpFrom(requestWith({ "x-forwarded-for": "a".repeat(65) }))).toBe("local");
  });
});

describe("checkIpRateLimit", () => {
  it("allows requests under the limit", async () => {
    mockedIncrement.mockResolvedValueOnce(5);
    const result = await checkIpRateLimit(db, "1.2.3.4", 10);
    expect(result).toEqual({ allowed: true });
  });

  it("rejects over the limit with a Retry-After matching the minute window", async () => {
    mockedIncrement.mockResolvedValueOnce(11);
    const result = await checkIpRateLimit(db, "1.2.3.4", 10, new Date("2026-07-06T12:00:45Z"));
    expect(result).toEqual({
      allowed: false,
      reason: "ip_rate_limited",
      retryAfterSeconds: 15,
    });
  });

  it("keys the counter on ip and minute window", async () => {
    mockedIncrement.mockResolvedValueOnce(1);
    await checkIpRateLimit(db, "1.2.3.4", 10, new Date("2026-07-06T12:00:45Z"));
    expect(mockedIncrement).toHaveBeenCalledWith(db, "ip:1.2.3.4:2026-07-06T12:00", 120);
  });
});

describe("checkCostGuard", () => {
  it("rejects when the daily budget is exhausted, with Retry-After until next UTC day", async () => {
    mockedIncrement
      .mockResolvedValueOnce(1) // ip counter
      .mockResolvedValueOnce(301); // daily counter
    const result = await checkCostGuard(
      db,
      "1.2.3.4",
      { perIpPerMinute: 10, dailyBudget: 300 },
      new Date("2026-07-06T23:59:00Z"),
    );
    expect(result).toEqual({
      allowed: false,
      reason: "daily_budget_exhausted",
      retryAfterSeconds: 60,
    });
  });

  it("allows when both counters are under their limits", async () => {
    mockedIncrement.mockResolvedValueOnce(3).mockResolvedValueOnce(42);
    const result = await checkCostGuard(db, "1.2.3.4", {
      perIpPerMinute: 10,
      dailyBudget: 300,
    });
    expect(result).toEqual({ allowed: true });
  });
});
