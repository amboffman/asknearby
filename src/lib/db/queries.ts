import { and, asc, eq, exists, inArray, type SQL, sql } from "drizzle-orm";

import { type Attribute, type StoreSearchResult } from "@/lib/types/store";

import { type Db } from "./client";
import { attributes, storeAttributes, stores } from "./schema";

export interface NearFilter {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface FindStoresFilters {
  /** Radius search center; omitted = brand-wide (alphabetical) listing. */
  near?: NearFilter;
  /** Stores must carry ALL of these attribute slugs. */
  requiredAttributeSlugs?: string[];
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

const DEFAULT_LIMIT = 50;

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

/**
 * Builds (without executing) the store search query, so tests can assert
 * the generated SQL without a live database.
 */
export function buildFindStoresQuery(db: Db, filters: FindStoresFilters) {
  const { near, requiredAttributeSlugs = [], limit = DEFAULT_LIMIT } = filters;

  const conditions: SQL[] = [];
  if (near) {
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

/** The full attribute catalog — source of truth for AI enums and UI filters. */
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
