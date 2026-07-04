import { SearchExperience, type StackInfo } from "@/components/search/search-experience";
import { DEFAULT_MODEL_IDS } from "@/lib/ai/provider";
import { findStores, getDb } from "@/lib/db";
import { type StoreSearchResult } from "@/lib/types/store";

// Browse mode reads the live store list per request (75 rows, indexed) —
// static prerendering would bake an empty list into CI builds that have
// no DATABASE_URL.
export const dynamic = "force-dynamic";

/** The footer strip names the real, currently-configured stack (ADR-004). */
function resolveStackInfo(): StackInfo {
  const provider = process.env.AI_PROVIDER === "google" ? "google" : "anthropic";
  return {
    modelId: process.env.AI_MODEL ?? DEFAULT_MODEL_IDS[provider],
    mapsProvider: process.env.NEXT_PUBLIC_MAPS_PROVIDER === "maplibre" ? "maplibre" : "google",
  };
}

export default async function Home() {
  let initialStores: StoreSearchResult[] = [];
  try {
    initialStores = await findStores(getDb(), { limit: 100 });
  } catch {
    // No reachable database (e.g. a CI build): browse mode starts empty
    // and the search flow reports its own errors.
  }
  return <SearchExperience initialStores={initialStores} stack={resolveStackInfo()} />;
}
