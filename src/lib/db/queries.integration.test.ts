// @vitest-environment node
// Live PostGIS integration tests. They run only when DATABASE_URL is set
// (author's Supabase project) and are skipped otherwise, so CI and offline
// runs stay green. NOTE: the suite reseeds the database (destructive by
// design — the dataset is a deterministic demo fixture).
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

config({ path: ".env.local", quiet: true });

import { type Db, getDb } from "./client";
import { findStores, listAttributes, UnknownAttributeError } from "./queries";
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

  it("rejects attribute slugs that are not in the catalog", async () => {
    const promise = findStores(db, {
      requiredAttributeSlugs: ["mens-department", "heliport"],
    });

    await expect(promise).rejects.toThrow(UnknownAttributeError);
    await expect(promise).rejects.toMatchObject({ unknownSlugs: ["heliport"] });
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
});
