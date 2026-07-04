import { z } from "zod";

// The typed contract between the AI translator (lib/ai), the search layer
// (lib/search), and eventually the UI. The model's ONLY job is to emit a
// value of this shape via one forced tool call (ADR-001).

export const geoIntentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("place"),
      placeName: z
        .string()
        .min(1)
        .describe(
          'The place the user wants to search near, verbatim-ish (e.g. "Columbus", "downtown Chicago"). Do not invent one.',
        ),
    })
    .describe("The user named a place to search near."),
  z
    .object({
      kind: z.literal("coordinates"),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .describe("The user supplied explicit coordinates."),
  z.object({ kind: z.literal("none") }).describe("No location intent in the request."),
]);

export type GeoIntent = z.infer<typeof geoIntentSchema>;

/** Bounds for the search radius; lib/search applies the default. */
export const RADIUS_KM = { min: 1, max: 100, default: 25 } as const;

const baseSearchQueryShape = {
  geo: geoIntentSchema.default({ kind: "none" }),
  radiusKm: z
    .number()
    .min(RADIUS_KM.min)
    .max(RADIUS_KM.max)
    .optional()
    .describe(
      `Search radius in kilometers, ONLY if the user stated one (e.g. "within 5 km"). Omit otherwise; the app applies a default.`,
    ),
  openNow: z
    .boolean()
    .default(false)
    .describe(
      'true only if the user asked for stores open right now (e.g. "open now", "currently open").',
    ),
} as const;

/**
 * Static schema: attribute slugs are free-form strings here (validated
 * against the catalog downstream). Use this to type and re-validate
 * SearchQuery values anywhere in the app.
 */
export const searchQuerySchema = z.object({
  attributeSlugs: z.array(z.string()).default([]).describe("Attributes the stores must ALL have."),
  ...baseSearchQueryShape,
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * The model-facing tool schema. Two deliberate differences from
 * {@link searchQuerySchema}:
 * - `attributeSlugs` is a closed enum of the live catalog, so the model
 *   cannot invent attributes (ADR-001).
 * - geo intent is FLAT optional fields instead of a discriminated union —
 *   small models reliably fill flat fields but mangle nested unions
 *   (observed live: Haiku emitted `geo` as a bare string).
 * {@link toSearchQuery} lifts the wire shape into the internal contract.
 */
export function buildSearchQueryToolSchema(catalogSlugs: readonly string[]) {
  const [first, ...rest] = catalogSlugs;
  if (!first) throw new Error("buildSearchQueryToolSchema requires a non-empty catalog");
  const { geo: _geo, ...withoutGeo } = baseSearchQueryShape;
  return z.object({
    attributeSlugs: z
      .array(z.enum([first, ...rest]))
      .default([])
      .describe(
        "Attributes the stores must ALL have. Only include attributes the user actually asked for.",
      ),
    placeName: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Place the user wants to search near, verbatim-ish (e.g. "Columbus"). Omit if none; never invent one.',
      ),
    latitude: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe("Only when the user gave explicit coordinates."),
    longitude: z.number().min(-180).max(180).optional(),
    ...withoutGeo,
  });
}

export type SearchQueryWire = z.infer<ReturnType<typeof buildSearchQueryToolSchema>>;

/** Lift the flat model-facing wire shape into the internal SearchQuery. */
export function toSearchQuery(wire: SearchQueryWire): SearchQuery {
  const geo: GeoIntent =
    wire.latitude !== undefined && wire.longitude !== undefined
      ? {
          kind: "coordinates",
          latitude: wire.latitude,
          longitude: wire.longitude,
        }
      : wire.placeName
        ? { kind: "place", placeName: wire.placeName }
        : { kind: "none" };
  return searchQuerySchema.parse({
    attributeSlugs: wire.attributeSlugs,
    geo,
    radiusKm: wire.radiusKm,
    openNow: wire.openNow,
  });
}
