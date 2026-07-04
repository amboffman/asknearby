import { sql } from "drizzle-orm";

import { type Db } from "./client";
import { attributes, storeAttributes, storeHours, stores } from "./schema";
import {
  ATTRIBUTE_CATALOG,
  ATTRIBUTE_PROBABILITY,
  BRAND,
  type CatalogAttribute,
  HOURS_PATTERNS,
  METROS,
  PARKING_WEIGHTS,
  SEED,
  STREET_NAMES,
} from "./seed-data";

export interface SeedStoreHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
}

export interface SeedStore {
  slug: string;
  name: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
  timezone: string;
  latitude: number;
  longitude: number;
  hours: SeedStoreHours[];
  attributeSlugs: string[];
}

export interface SeedData {
  attributes: readonly CatalogAttribute[];
  stores: SeedStore[];
}

/**
 * mulberry32 — tiny integer-arithmetic PRNG; same seed, same sequence, on
 * every platform. Good enough for plausible-looking demo data, which is all
 * it is used for.
 */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rng: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const last = entries[entries.length - 1];
  if (!last) throw new Error("pickWeighted requires at least one entry");
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return last[0];
}

function kebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const DEPARTMENT_SLUGS = ATTRIBUTE_CATALOG.filter((a) => a.category === "department").map(
  (a) => a.slug,
);

/**
 * Pure function of the seed value: same input, same 75 stores, always.
 * Applying it to a database lives separately in {@link applySeed}.
 */
export function generateSeedData(seed: number = SEED): SeedData {
  const rng = mulberry32(seed);
  const result: SeedStore[] = [];
  let storeIndex = 0;

  for (const metro of METROS) {
    for (const hood of metro.neighborhoods) {
      // Small jitter (~±400 m) so stores sit near, not on, the area center.
      const latitude = round6(hood.latitude + (rng() - 0.5) * 0.008);
      const longitude = round6(hood.longitude + (rng() - 0.5) * 0.008);

      const streetNumber = 100 + Math.floor(rng() * 9800);
      const street = STREET_NAMES[Math.floor(rng() * STREET_NAMES.length)];

      // 555-01xx is the reserved fictional range; index keeps it unique.
      const areaCode = hood.areaCode ?? metro.areaCode;
      const phone = `(${areaCode}) 555-01${String(storeIndex).padStart(2, "0")}`;

      const pattern = pickWeighted(
        rng,
        HOURS_PATTERNS.map(
          (p) => [p, hood.kind === "urban" ? p.urbanWeight : p.suburbanWeight] as const,
        ),
      );
      const hours: SeedStoreHours[] = pattern.days.flatMap((day, dayOfWeek) =>
        day ? [{ dayOfWeek, opensAt: day[0], closesAt: day[1] }] : [],
      );

      const attributeSlugs: string[] = [];
      for (const [slug, probability] of Object.entries(ATTRIBUTE_PROBABILITY)) {
        if (rng() < probability) attributeSlugs.push(slug);
      }
      // Every store carries at least one department — an outfitter with no
      // departments at all would make attribute demos look broken.
      if (!attributeSlugs.some((slug) => DEPARTMENT_SLUGS.includes(slug))) {
        attributeSlugs.unshift("womens-department");
      }
      attributeSlugs.push(pickWeighted(rng, PARKING_WEIGHTS[hood.kind]));

      result.push({
        slug: `${kebab(metro.name)}-${kebab(hood.area)}`,
        name: `${BRAND} — ${hood.area}`,
        streetAddress: `${streetNumber} ${street}`,
        city: hood.city,
        state: hood.state,
        postalCode: hood.postalCode,
        phone,
        timezone: metro.timezone,
        latitude,
        longitude,
        hours,
        attributeSlugs,
      });
      storeIndex += 1;
    }
  }

  return { attributes: ATTRIBUTE_CATALOG, stores: result };
}

function round6(value: number): number {
  return Number(value.toFixed(6));
}

export interface SeedSummary {
  attributeCount: number;
  storeCount: number;
  storesByState: Record<string, number>;
}

/**
 * Destructive reseed: truncates all four tables and reinserts. This is a
 * demo dataset — reproducibility beats preservation.
 */
export async function applySeed(db: Db, data: SeedData): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`TRUNCATE TABLE store_attributes, store_hours, stores, attributes RESTART IDENTITY CASCADE`,
    );

    const attributeRows = await tx
      .insert(attributes)
      .values(
        data.attributes.map(({ slug, label, category }) => ({
          slug,
          label,
          category,
        })),
      )
      .returning({ id: attributes.id, slug: attributes.slug });
    const attributeIdBySlug = new Map(attributeRows.map((row) => [row.slug, row.id]));

    const storeRows = await tx
      .insert(stores)
      .values(data.stores.map(({ hours: _hours, attributeSlugs: _attrs, ...store }) => store))
      .returning({ id: stores.id, slug: stores.slug });
    const storeIdBySlug = new Map(storeRows.map((row) => [row.slug, row.id]));

    const hourRows = data.stores.flatMap((store) =>
      store.hours.map((h) => ({ storeId: storeIdBySlug.get(store.slug)!, ...h })),
    );
    await tx.insert(storeHours).values(hourRows);

    const attributeLinks = data.stores.flatMap((store) =>
      store.attributeSlugs.map((slug) => ({
        storeId: storeIdBySlug.get(store.slug)!,
        attributeId: attributeIdBySlug.get(slug)!,
      })),
    );
    await tx.insert(storeAttributes).values(attributeLinks);

    const storesByState: Record<string, number> = {};
    for (const store of data.stores) {
      storesByState[store.state] = (storesByState[store.state] ?? 0) + 1;
    }
    return {
      attributeCount: attributeRows.length,
      storeCount: storeRows.length,
      storesByState,
    };
  });
}
