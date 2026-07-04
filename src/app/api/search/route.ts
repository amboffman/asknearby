// POST /api/search — the whole spine in one handler: sentence -> forced
// tool call -> SearchQuery -> geocode -> PostGIS -> rows.
// NOTE: calls a paid model per request. Local/dev only until Week D lands
// the per-IP rate limit + daily budget breaker (AGENTS.md requirement
// before the URL is shared anywhere).
import { z } from "zod";

import { TranslationFailedError, translateQuery } from "@/lib/ai/translate";
import { createAppGeocoder } from "@/lib/config/geocoder";
import { getDb, listAttributes } from "@/lib/db";
import { searchStores } from "@/lib/search";

const bodySchema = z.object({
  q: z.string().trim().min(1).max(300),
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
    const catalog = await listAttributes(db);
    const query = await translateQuery(parsedBody.data.q, catalog);
    const outcome = await searchStores(db, query, {
      geocoder: createAppGeocoder(),
    });
    return Response.json(outcome);
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
