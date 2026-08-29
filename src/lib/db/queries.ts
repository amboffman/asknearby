import { and, asc, eq, exists, inArray, type SQL, sql } from "drizzle-orm";

import {
  type Attribute,
  type StoreDetails,
  type StoreHoursEntry,
  type StoreSearchResult,
} from "@/lib/types/store";

import { type Db } from "./client";
import { attributes, storeAttributes, storeHours, stores, usageCounters } from "./schema";

export interface NearFilter {
  latitude: number;
  longitude: number;
  /**
   * Omit to sort by distance WITHOUT filtering. Used by no-results
   * diagnosis to find the nearest match outside the requested radius.
   */
  radiusMeters?: number;
}

export interface FindStoresFilters {
  /** Radius search center; omitted = brand-wide (alphabetical) listing. */
  near?: NearFilter;
  /** Stores must carry ALL of these attribute slugs. */
  requiredAttributeSlugs?: string[];
  /**
   * Only stores whose hours cover this instant, evaluated in each store's
   * own timezone ("open now" = openAt: new Date(); parameterized so tests
   * can pin the clock).
   */
  openAt?: Date;
  limit?: number;
}

/**
 * Requesting a slug that is not in the catalog is a caller bug, not an
 * empty result. Silent zero-matches is the locator failure mode ADR-001
 * exists to prevent, so it throws loudly instead.
 */
export class UnknownAttributeError extends Error {
  constructor(readonly unknownSlugs: string[]) {
    super(`Unknown attribute slug(s): ${unknownSlugs.join(", ")}`);
    this.name = "UnknownAttributeError";
  }
}

/**
 * Shared by search and browse mode so removing every chip can never show
 * fewer stores than the initial browse view. Must stay above the dataset
 * size (75 seeded stores) or chain-wide searches silently truncate.
 */
export const STORE_RESULT_LIMIT = 100;

const storeSelection = {
  id: stores.id,
  slug: stores.slug,
  name: stores.name,
  streetAddress: stores.streetAddress,
  city: stores.city,
  state: stores.state,
  postalCode: stores.postalCode,
  phone: stores.phone,
  timezone: stores.timezone,
  latitude: stores.latitude,
  longitude: stores.longitude,
};

function geographyPoint(longitude: number, latitude: number): SQL {
  return sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography`;
}

/** The WHERE conditions shared by the search query and its COUNT twin. */
function buildStoreConditions(db: Db, filters: FindStoresFilters): SQL[] {
  const { near, requiredAttributeSlugs = [], openAt } = filters;

  const conditions: SQL[] = [];
  if (openAt) {
    // The instant rendered as each store's local wall-clock time. A chain
    // spanning time zones means "open now" differs per store (ADR-001).
    const localTime = sql`(${openAt.toISOString()}::timestamptz AT TIME ZONE ${stores.timezone})`;
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(storeHours)
          .where(
            and(
              eq(storeHours.storeId, stores.id),
              sql`${storeHours.dayOfWeek} = EXTRACT(DOW FROM ${localTime})::smallint`,
              sql`${localTime}::time >= ${storeHours.opensAt}`,
              sql`${localTime}::time < ${storeHours.closesAt}`,
            ),
          ),
      ),
    );
  }
  if (near?.radiusMeters !== undefined) {
    // Geography + ST_DWithin = meters on the spheroid, GiST-indexed.
    conditions.push(
      sql`ST_DWithin(${stores.location}, ${geographyPoint(near.longitude, near.latitude)}, ${near.radiusMeters})`,
    );
  }
  // Relational division as one correlated EXISTS per required attribute:
  // each subquery is a primary-key probe on store_attributes.
  for (const slug of requiredAttributeSlugs) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(storeAttributes)
          .innerJoin(attributes, eq(storeAttributes.attributeId, attributes.id))
          .where(and(eq(storeAttributes.storeId, stores.id), eq(attributes.slug, slug))),
      ),
    );
  }

  return conditions;
}

/**
 * Builds (without executing) the store search query, so tests can assert
 * the generated SQL without a live database.
 */
export function buildFindStoresQuery(db: Db, filters: FindStoresFilters) {
  const { near, limit = STORE_RESULT_LIMIT } = filters;
  const conditions = buildStoreConditions(db, filters);

  const distanceMeters = near
    ? sql<number>`ST_Distance(${stores.location}, ${geographyPoint(near.longitude, near.latitude)})`.mapWith(
        Number,
      )
    : sql<number | null>`NULL`;

  return db
    .select({ ...storeSelection, distanceMeters })
    .from(stores)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(...(near ? [asc(distanceMeters), asc(stores.name)] : [asc(stores.name)]))
    .limit(limit);
}

/** Store search: optional radius filter + required-attribute filters. */
export async function findStores(
  db: Db,
  filters: FindStoresFilters = {},
): Promise<StoreSearchResult[]> {
  const slugs = filters.requiredAttributeSlugs ?? [];
  if (slugs.length > 0) {
    const known = await db
      .select({ slug: attributes.slug })
      .from(attributes)
      .where(inArray(attributes.slug, slugs));
    const knownSlugs = new Set(known.map((row) => row.slug));
    const unknown = slugs.filter((slug) => !knownSlugs.has(slug));
    if (unknown.length > 0) throw new UnknownAttributeError(unknown);
  }

  const rows = await buildFindStoresQuery(db, filters);
  return rows.map((row) => ({
    ...row,
    distanceMeters: row.distanceMeters === null ? null : Number(row.distanceMeters),
  }));
}

/**
 * COUNT(*) twin of findStores: exact matches for the same filters with
 * no LIMIT, so no-results diagnosis reports true chain-wide numbers even
 * when they exceed STORE_RESULT_LIMIT.
 */
export async function countStores(db: Db, filters: FindStoresFilters = {}): Promise<number> {
  const conditions = buildStoreConditions(db, filters);
  const rows = await db
    .select({ total: sql<number>`count(*)`.mapWith(Number) })
    .from(stores)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return rows[0]?.total ?? 0;
}

/**
 * Chain-wide store counts per attribute slug (no-results diagnosis:
 * "which filters matched nothing"). Slugs are assumed catalog-valid.
 */
export async function countStoresPerAttribute(
  db: Db,
  slugs: readonly string[],
): Promise<Record<string, number>> {
  if (slugs.length === 0) return {};
  const rows = await db
    .select({
      slug: attributes.slug,
      storeCount: sql<number>`count(${storeAttributes.storeId})`.mapWith(Number),
    })
    .from(attributes)
    .leftJoin(storeAttributes, eq(storeAttributes.attributeId, attributes.id))
    .where(inArray(attributes.slug, [...slugs]))
    .groupBy(attributes.slug);
  return Object.fromEntries(rows.map((row) => [row.slug, row.storeCount]));
}

/** One store with its attributes and weekly hours (Week D detail panel). */
export async function getStoreDetails(db: Db, storeId: number): Promise<StoreDetails | null> {
  const [store] = await db.select(storeSelection).from(stores).where(eq(stores.id, storeId));
  if (!store) return null;

  const [storeAttrs, hours] = await Promise.all([
    db
      .select({
        slug: attributes.slug,
        label: attributes.label,
        category: attributes.category,
      })
      .from(storeAttributes)
      .innerJoin(attributes, eq(storeAttributes.attributeId, attributes.id))
      .where(eq(storeAttributes.storeId, storeId))
      .orderBy(asc(attributes.category), asc(attributes.label)),
    db
      .select({
        dayOfWeek: storeHours.dayOfWeek,
        opensAt: storeHours.opensAt,
        closesAt: storeHours.closesAt,
      })
      .from(storeHours)
      .where(eq(storeHours.storeId, storeId))
      .orderBy(asc(storeHours.dayOfWeek)),
  ]);

  return {
    ...store,
    attributes: storeAttrs,
    hours: hours.map((h) => ({
      ...h,
      // pg `time` renders as HH:MM:SS; the domain contract is HH:MM.
      opensAt: h.opensAt.slice(0, 5),
      closesAt: h.closesAt.slice(0, 5),
    })),
  };
}

/**
 * Weekly hours for a set of stores in one query (the search API attaches
 * them so list rows can show an open/closed status line).
 */
export async function listHoursForStores(
  db: Db,
  storeIds: readonly number[],
): Promise<Map<number, StoreHoursEntry[]>> {
  const byStore = new Map<number, StoreHoursEntry[]>();
  if (storeIds.length === 0) return byStore;

  const rows = await db
    .select({
      storeId: storeHours.storeId,
      dayOfWeek: storeHours.dayOfWeek,
      opensAt: storeHours.opensAt,
      closesAt: storeHours.closesAt,
    })
    .from(storeHours)
    .where(inArray(storeHours.storeId, [...storeIds]))
    .orderBy(asc(storeHours.storeId), asc(storeHours.dayOfWeek));

  for (const row of rows) {
    const entries = byStore.get(row.storeId) ?? [];
    entries.push({
      dayOfWeek: row.dayOfWeek,
      // pg `time` renders as HH:MM:SS; the domain contract is HH:MM.
      opensAt: row.opensAt.slice(0, 5),
      closesAt: row.closesAt.slice(0, 5),
    });
    byStore.set(row.storeId, entries);
  }
  return byStore;
}

/**
 * Atomically increment a windowed usage counter and return the new count
 * (cost protection: per-IP rate limit + daily budget breaker). Expired
 * rows are swept opportunistically on ~2% of calls.
 */
export async function incrementUsageCounter(
  db: Db,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  if (Math.random() < 0.02) {
    // Awaited: a serverless runtime freezes the instance once the response
    // is sent, so a fire-and-forget DELETE would usually be killed mid-
    // flight and the table would grow without bound. Best-effort otherwise.
    try {
      await db.delete(usageCounters).where(sql`${usageCounters.expiresAt} < now()`);
    } catch {
      // The increment must not fail because sweeping did.
    }
  }
  const rows = await db
    .insert(usageCounters)
    .values({
      key,
      count: 1,
      expiresAt: sql`now() + make_interval(secs => ${ttlSeconds})`,
    })
    .onConflictDoUpdate({
      target: usageCounters.key,
      set: { count: sql`${usageCounters.count} + 1` },
    })
    .returning({ count: usageCounters.count });
  return rows[0]!.count;
}

/** The full attribute catalog: source of truth for AI enums and UI filters. */
export async function listAttributes(db: Db): Promise<Attribute[]> {
  return db
    .select({
      slug: attributes.slug,
      label: attributes.label,
      category: attributes.category,
    })
    .from(attributes)
    .orderBy(asc(attributes.category), asc(attributes.label));
}
