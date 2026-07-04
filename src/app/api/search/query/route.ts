// POST /api/search/query — the deterministic half of the spine (ADR-004):
// an already-typed SearchQuery in, rows out, NO model call. The UI's
// query-chip edits re-run through here, so removing a filter costs a
// database query, not tokens. Sends geo as coordinates (the center the
// first search resolved), so the geocoder is never re-paid either.
import { z } from "zod";

import { checkIpRateLimit } from "@/lib/config/cost-guard";
import { createAppGeocoder } from "@/lib/config/geocoder";
import { getDb, UnknownAttributeError } from "@/lib/db";
import { attachStoreHours, searchStores } from "@/lib/search";
import { searchQuerySchema } from "@/lib/types/search-query";

const bodySchema = z.object({ query: searchQuerySchema });

export async function POST(request: Request) {
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return Response.json({ error: "Body must be { query: SearchQuery }." }, { status: 400 });
  }

  try {
    const db = getDb();

    // No model call here, so only the per-IP limiter applies — the daily
    // AI budget must not be drained by free re-runs.
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const guard = await checkIpRateLimit(db, ip);
    if (!guard.allowed) {
      return Response.json(
        { error: "Too many searches — try again in a minute." },
        { status: 429, headers: { "Retry-After": String(guard.retryAfterSeconds) } },
      );
    }

    const outcome = await searchStores(db, parsedBody.data.query, {
      geocoder: createAppGeocoder(),
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
