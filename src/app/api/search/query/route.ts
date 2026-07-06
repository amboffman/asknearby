// POST /api/search/query — the deterministic half of the spine (ADR-004):
// an already-typed SearchQuery in, rows out, NO model call. The UI's
// query-chip edits re-run through here, so removing a filter costs a
// database query, not tokens. Geo must arrive as coordinates (the center
// the first search resolved) or none: `place` is rejected with a 400, so
// the paid geocoder is unreachable from this route by construction.
import { z } from "zod";

import { checkIpRateLimit, clientIpFrom } from "@/lib/config/cost-guard";
import { getDb, UnknownAttributeError } from "@/lib/db";
import { attachStoreHours, searchStores } from "@/lib/search";
import { searchQuerySchema } from "@/lib/types/search-query";

const bodySchema = z.object({ query: searchQuerySchema });

/** Never resolves anything — this route must not pay for geocoding. */
const inertGeocoder = { geocode: async () => null };

export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return Response.json({ error: "Body must be { query: SearchQuery }." }, { status: 400 });
  }
  if (parsedBody.data.query.geo.kind === "place") {
    return Response.json(
      { error: "geo.kind 'place' is not accepted here — send the resolved coordinates instead." },
      { status: 400 },
    );
  }

  try {
    const db = getDb();

    // No model call here, so only the per-IP limiter applies — the daily
    // AI budget must not be drained by free re-runs.
    const guard = await checkIpRateLimit(db, clientIpFrom(request));
    if (!guard.allowed) {
      return Response.json(
        { error: "Too many searches — try again in a minute." },
        { status: 429, headers: { "Retry-After": String(guard.retryAfterSeconds) } },
      );
    }

    const outcome = await searchStores(db, parsedBody.data.query, {
      geocoder: inertGeocoder,
    });
    return Response.json(await attachStoreHours(db, outcome));
  } catch (error) {
    if (error instanceof UnknownAttributeError) {
      return Response.json(
        { error: `Unknown attribute filter: ${error.unknownSlugs.join(", ")}.` },
        { status: 400 },
      );
    }
    console.error("/api/search/query failed:", error);
    return Response.json({ error: "Search failed." }, { status: 500 });
  }
}
