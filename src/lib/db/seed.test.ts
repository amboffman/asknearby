import { describe, expect, it } from "vitest";

import { generateSeedData } from "./seed";
import { ATTRIBUTE_CATALOG, METROS } from "./seed-data";

const data = generateSeedData();

describe("generateSeedData", () => {
  it("is deterministic: same seed, identical dataset", () => {
    expect(generateSeedData()).toEqual(data);
  });

  it("produces a different dataset for a different seed", () => {
    expect(generateSeedData(1)).not.toEqual(data);
  });

  it("covers ~75 stores across all metros and the full catalog", () => {
    const expected = METROS.reduce((n, m) => n + m.neighborhoods.length, 0);
    expect(data.stores).toHaveLength(expected);
    expect(data.stores.length).toBeGreaterThanOrEqual(70);
    expect(data.attributes).toHaveLength(ATTRIBUTE_CATALOG.length);
  });

  it("gives every store a unique slug and a unique fictional phone", () => {
    const slugs = new Set(data.stores.map((s) => s.slug));
    expect(slugs.size).toBe(data.stores.length);

    const phones = new Set(data.stores.map((s) => s.phone));
    expect(phones.size).toBe(data.stores.length);
    for (const store of data.stores) {
      // 555-01xx is the reserved-for-fiction number range.
      expect(store.phone).toMatch(/^\(\d{3}\) 555-01\d{2}$/);
    }
  });

  it("only assigns attributes that exist in the catalog", () => {
    const known = new Set(ATTRIBUTE_CATALOG.map((a) => a.slug));
    for (const store of data.stores) {
      for (const slug of store.attributeSlugs) {
        expect(known).toContain(slug);
      }
      expect(new Set(store.attributeSlugs).size).toBe(store.attributeSlugs.length);
    }
  });

  it("gives every store at least one department and exactly one parking option", () => {
    const bySlug = new Map(ATTRIBUTE_CATALOG.map((a) => [a.slug, a.category]));
    for (const store of data.stores) {
      const categories = store.attributeSlugs.map((slug) => bySlug.get(slug));
      expect(categories).toContain("department");
      expect(categories.filter((c) => c === "parking")).toHaveLength(1);
    }
  });

  it("produces valid weekly hours", () => {
    for (const store of data.stores) {
      const days = store.hours.map((h) => h.dayOfWeek);
      expect(new Set(days).size).toBe(days.length);
      expect(store.hours.length).toBeGreaterThanOrEqual(5);
      for (const { dayOfWeek, opensAt, closesAt } of store.hours) {
        expect(dayOfWeek).toBeGreaterThanOrEqual(0);
        expect(dayOfWeek).toBeLessThanOrEqual(6);
        expect(opensAt).toMatch(/^\d{2}:\d{2}$/);
        expect(closesAt).toMatch(/^\d{2}:\d{2}$/);
        expect(opensAt < closesAt).toBe(true);
      }
    }
  });

  it("keeps jittered coordinates near each neighborhood center", () => {
    const hoodBySlug = new Map<string, (typeof METROS)[number]["neighborhoods"][number]>(
      METROS.flatMap((m) =>
        m.neighborhoods.map((h) => [`${kebab(m.name)}-${kebab(h.area)}`, h] as const),
      ),
    );
    for (const store of data.stores) {
      const hood = hoodBySlug.get(store.slug);
      expect(hood).toBeDefined();
      expect(Math.abs(store.latitude - hood!.latitude)).toBeLessThan(0.005);
      expect(Math.abs(store.longitude - hood!.longitude)).toBeLessThan(0.005);
    }
  });

  it("has results for the flagship demo query (men's dept + free parking, Columbus)", () => {
    const matches = data.stores.filter(
      (s) =>
        s.slug.startsWith("columbus-") &&
        s.attributeSlugs.includes("mens-department") &&
        s.attributeSlugs.includes("free-parking"),
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});

function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
