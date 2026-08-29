import { sql } from "drizzle-orm";
import {
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
} from "drizzle-orm/pg-core";

// drizzle-orm ships a postgis `geometry` type but not `geography`; radius
// search wants geography so ST_DWithin works in meters on the spheroid
// (ADR-001). The column is generated from latitude/longitude, so the ORM
// never writes or round-trips it; string is fine as the nominal data type.
const geographyPoint = customType<{ data: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

export const attributeCategory = pgEnum("attribute_category", [
  "department",
  "service",
  "amenity",
  "parking",
]);

export const stores = pgTable(
  "stores",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    streetAddress: text().notNull(),
    city: text().notNull(),
    state: text().notNull(), // two-letter USPS code
    postalCode: text().notNull(),
    phone: text().notNull(),
    timezone: text().notNull(), // IANA name; "open now" math is per-store (ADR-001)
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    location: geographyPoint()
      .notNull()
      .generatedAlwaysAs(sql`ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stores_location_gix").using("gist", t.location)],
);

// A closed day is an absent row; one row per (store, weekday).
export const storeHours = pgTable(
  "store_hours",
  {
    storeId: integer()
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    dayOfWeek: smallint().notNull(), // 0 = Sunday … 6 = Saturday
    opensAt: time().notNull(),
    closesAt: time().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.dayOfWeek] }),
    check("store_hours_day_of_week_range", sql`day_of_week BETWEEN 0 AND 6`),
    // Overnight spans (closes <= opens) are unrepresentable by the open-now
    // predicate and openStatus display logic; enforce the assumption here
    // so bad rows fail loudly instead of reading as permanently closed.
    check("store_hours_opens_before_closes", sql`opens_at < closes_at`),
  ],
);

// The attribute catalog is data, not schema (ADR-001): it is the single
// source of truth for the seed, the AI tool schema's enum, and UI filters.
export const attributes = pgTable("attributes", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  slug: text().notNull().unique(),
  label: text().notNull(),
  category: attributeCategory().notNull(),
});

// Cost-protection counters (Week D): serverless instances share no memory,
// so per-IP rate limits and the daily AI budget breaker count here.
// Keys are windowed (e.g. "ip:1.2.3.4:2026-07-04T13:37", "global:2026-07-04");
// expired rows are opportunistically swept.
export const usageCounters = pgTable("usage_counters", {
  key: text().primaryKey(),
  count: integer().notNull().default(0),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const storeAttributes = pgTable(
  "store_attributes",
  {
    storeId: integer()
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    attributeId: integer()
      .notNull()
      .references(() => attributes.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.storeId, t.attributeId] }),
    index("store_attributes_attribute_idx").on(t.attributeId),
  ],
);
