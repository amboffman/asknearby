// @vitest-environment node
// Live PostGIS integration tests. They run only when DATABASE_URL is set
// (author's Supabase project) and are skipped otherwise, so CI and offline
// runs stay green. NOTE: the suite reseeds the database (destructive by
// design — the dataset is a deterministic demo fixture).
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

import { searchStores } from "@/lib/search";
import { searchQuerySchema } from "@/lib/types/search-query";

import { type Db, getDb } from "./client";
import {
  countStoresPerAttribute,
  findStores,
  getStoreDetails,
  listAttributes,
  UnknownAttributeError,
} from "./queries";
import { applySeed, generateSeedData } from "./seed";

const databaseUrl = process.env.DATABASE_URL;

// Downtown Columbus — the center the flagship demo sentence resolves to.
const columbus = { latitude: 39.962, longitude: -83.001 };

describe.skipIf(!databaseUrl)("lib/db against live PostGIS", () => {
  let db: Db;
  const seedData = generateSeedData();

  beforeAll(async () => {
    db = getDb();
    await applySeed(db, seedData);
  }, 120_000);

  afterAll(async () => {
    await db?.$client.end();
  });

  it("radius search returns only in-radius stores, nearest first", async () => {
    const radiusMeters = 15_000;
    const results = await findStores(db, { near: { ...columbus, radiusMeters } });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.slug).toBe("columbus-downtown");
    for (const store of results) {
      expect(store.slug).toMatch(/^columbus-/);
      expect(store.distanceMeters).not.toBeNull();
      expect(store.distanceMeters!).toBeLessThanOrEqual(radiusMeters);
    }
    const distances = results.map((r) => r.distanceMeters!);
    expect(distances).toEqual([...distances].sort((a, b) => a - b));
  });

  it("attribute filter = stores carrying ALL required attributes", async () => {
    const slugs = ["mens-department", "free-parking"];
    const results = await findStores(db, {
      requiredAttributeSlugs: slugs,
      limit: 100,
    });

    const expected = seedData.stores
      .filter((s) => slugs.every((slug) => s.attributeSlugs.includes(slug)))
      .map((s) => s.slug)
      .sort();
    expect(results.map((r) => r.slug).sort()).toEqual(expected);
    expect(results.every((r) => r.distanceMeters === null)).toBe(true);
  });

  it("answers the flagship demo sentence (men's dept + free parking near Columbus)", async () => {
    const results = await findStores(db, {
      near: { ...columbus, radiusMeters: 30_000 },
      requiredAttributeSlugs: ["mens-department", "free-parking"],
    });

    expect(results.length).toBeGreaterThan(0);
    for (const store of results) {
      expect(store.slug).toMatch(/^columbus-/);
    }
  });

  it("openAt: a Wednesday-noon instant finds every store open", async () => {
    // 2026-07-08 is a Wednesday; 17:00 UTC = 13:00 ET / 12:00 CT, inside
    // every weekday hours pattern in the seed.
    const results = await findStores(db, {
      openAt: new Date("2026-07-08T17:00:00Z"),
      limit: 100,
    });
    expect(results).toHaveLength(seedData.stores.length);
  });

  it("openAt: a middle-of-the-night instant finds none", async () => {
    // 08:00 UTC = 04:00 ET / 03:00 CT.
    const results = await findStores(db, {
      openAt: new Date("2026-07-08T08:00:00Z"),
      limit: 100,
    });
    expect(results).toHaveLength(0);
  });

  it("openAt: Sunday matches exactly the seed's Sunday-open stores, per timezone", async () => {
    // 2026-07-12 is a Sunday; 17:00 UTC = 13:00 ET / 12:00 CT (July DST).
    const openAt = new Date("2026-07-12T17:00:00Z");
    const utcOffsetHours: Record<string, number> = {
      "America/New_York": -4,
      "America/Indiana/Indianapolis": -4,
      "America/Chicago": -5,
    };
    const expected = seedData.stores
      .filter((store) => {
        const localHour = 17 + (utcOffsetHours[store.timezone] ?? 0);
        const hhmm = `${String(localHour).padStart(2, "0")}:00`;
        return store.hours.some((h) => h.dayOfWeek === 0 && h.opensAt <= hhmm && hhmm < h.closesAt);
      })
      .map((store) => store.slug)
      .sort();

    const results = await findStores(db, { openAt, limit: 100 });

    expect(results.map((r) => r.slug).sort()).toEqual(expected);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(seedData.stores.length);
  });

  it("rejects attribute slugs that are not in the catalog", async () => {
    const promise = findStores(db, {
      requiredAttributeSlugs: ["mens-department", "heliport"],
    });

    await expect(promise).rejects.toThrow(UnknownAttributeError);
    await expect(promise).rejects.toMatchObject({ unknownSlugs: ["heliport"] });
  });

  it("getStoreDetails returns the seed's attributes and hours for a store", async () => {
    const [downtown] = await findStores(db, {
      near: { ...columbus, radiusMeters: 3_000 },
      limit: 1,
    });
    expect(downtown).toBeDefined();

    const details = await getStoreDetails(db, downtown!.id);
    expect(details).not.toBeNull();

    const seeded = seedData.stores.find((s) => s.slug === details!.slug)!;
    expect(details!.attributes.map((a) => a.slug).sort()).toEqual(
      [...seeded.attributeSlugs].sort(),
    );
    expect(details!.hours.map((h) => `${h.dayOfWeek} ${h.opensAt}-${h.closesAt}`)).toEqual(
      [...seeded.hours]
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
        .map((h) => `${h.dayOfWeek} ${h.opensAt}-${h.closesAt}`),
    );
  });

  it("getStoreDetails returns null for an unknown id", async () => {
    await expect(getStoreDetails(db, 999_999)).resolves.toBeNull();
  });

  it("lists the seeded attribute catalog", async () => {
    const catalog = await listAttributes(db);

    expect(catalog).toHaveLength(seedData.attributes.length);
    expect(catalog).toContainEqual({
      slug: "mens-department",
      label: "Men's department",
      category: "department",
    });
  });

  it("counts stores per attribute chain-wide, matching the seed", async () => {
    const slugs = ["mens-department", "ev-charging"];
    const counts = await countStoresPerAttribute(db, slugs);

    for (const slug of slugs) {
      const expected = seedData.stores.filter((s) => s.attributeSlugs.includes(slug)).length;
      expect(counts[slug]).toBe(expected);
    }
  });

  // lib/search's no-results diagnosis lives in this file so all live-DB
  // tests stay in one file (vitest runs files in parallel; two suites
  // reseeding the same database would race).
  it("diagnoses zero results: filter counts + nearest match distance", async () => {
    const denver = { latitude: 39.7392, longitude: -104.9903 };
    const outcome = await searchStores(
      db,
      searchQuerySchema.parse({
        attributeSlugs: ["mens-department"],
        geo: { kind: "place", placeName: "Denver" },
      }),
      { geocoder: { geocode: () => Promise.resolve(denver) } },
    );

    expect(outcome.stores).toHaveLength(0);
    expect(outcome.noResults).toBeDefined();
    const diagnosis = outcome.noResults!;

    const chainWide = seedData.stores.filter((s) =>
      s.attributeSlugs.includes("mens-department"),
    ).length;
    expect(diagnosis.attributeCounts).toEqual([{ slug: "mens-department", storeCount: chainWide }]);
    expect(diagnosis.matchesIgnoringLocation).toBe(chainWide);
    // Denver is ~1,700 km from the nearest metro (Chicago).
    expect(diagnosis.nearestDistanceMeters).toBeGreaterThan(1_000_000);
  });

  it("omits the diagnosis when results exist", async () => {
    const outcome = await searchStores(db, searchQuerySchema.parse({}), {
      geocoder: { geocode: () => Promise.resolve(null) },
    });
    expect(outcome.stores.length).toBeGreaterThan(0);
    expect(outcome.noResults).toBeUndefined();
  });
});
