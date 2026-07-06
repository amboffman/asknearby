// POST /api/search — the whole spine in one handler: sentence -> forced
// tool call -> SearchQuery -> geocode -> PostGIS -> rows.
// Calls a paid model per request, so the cost guard (per-IP rate limit +
// daily budget breaker) runs first — the AGENTS.md precondition for
// sharing the deployed URL.
import { z } from "zod";

import { TranslationFailedError, translateQuery } from "@/lib/ai/translate";
import { checkCostGuard, clientIpFrom } from "@/lib/config/cost-guard";
import { createAppGeocoder } from "@/lib/config/geocoder";
import { getDb, listAttributes } from "@/lib/db";
import { applyUserLocation, attachStoreHours, searchStores } from "@/lib/search";

const bodySchema = z.object({
  q: z.string().trim().min(1).max(300),
  /** Browser geolocation ("near me"); used only when the sentence names no place. */
  userLocation: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
});

export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return Response.json(
      { error: "Body must be { q: string } with 1–300 characters." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    // Cost protection BEFORE the paid model call (per-IP + daily budget).
    const guard = await checkCostGuard(db, clientIpFrom(request));
    if (!guard.allowed) {
      return Response.json(
        {
          error:
            guard.reason === "ip_rate_limited"
              ? "Too many searches — try again in a minute."
              : "Today's search budget is used up — please come back tomorrow.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(guard.retryAfterSeconds) },
        },
      );
    }

    const catalog = await listAttributes(db);
    const translated = await translateQuery(parsedBody.data.q, catalog);
    const query = applyUserLocation(translated, parsedBody.data.userLocation);
    const outcome = await searchStores(db, query, {
      geocoder: createAppGeocoder(),
    });
    return Response.json(await attachStoreHours(db, outcome));
  } catch (error) {
    if (error instanceof TranslationFailedError) {
      return Response.json(
        { error: "Could not understand that request — try rephrasing." },
        { status: 422 },
      );
    }
    console.error("/api/search failed:", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
