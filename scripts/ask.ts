// pnpm ask "stores with a men's department and free parking near Columbus"
// The Week B demo: sentence -> SearchQuery JSON -> matching rows.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { translateQuery } from "../src/lib/ai/translate";
import { getDb, listAttributes } from "../src/lib/db";
import { METROS } from "../src/lib/db/seed-data";
import { createGazetteerGeocoder, type GazetteerPlace } from "../src/lib/providers/geocoding";
import { searchStores } from "../src/lib/search";

/** Metro centroids from the seed data — Week C replaces this with Google. */
function metroPlaces(): GazetteerPlace[] {
  return METROS.map((metro) => ({
    name: metro.name,
    latitude: avg(metro.neighborhoods.map((n) => n.latitude)),
    longitude: avg(metro.neighborhoods.map((n) => n.longitude)),
  }));
}

function avg(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

async function main() {
  const sentence = process.argv.slice(2).join(" ").trim();
  if (!sentence) {
    console.error('Usage: pnpm ask "stores with free parking near Columbus"');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set in .env.local.");
    process.exit(1);
  }

  const db = getDb();
  const catalog = await listAttributes(db);

  const startedAt = performance.now();
  const query = await translateQuery(sentence, catalog);
  const translateMs = Math.round(performance.now() - startedAt);

  console.log(`\nSearchQuery (translated in ${translateMs} ms):`);
  console.log(JSON.stringify(query, null, 2));

  const outcome = await searchStores(db, query, {
    geocoder: createGazetteerGeocoder(metroPlaces()),
  });

  if (outcome.unresolvedPlaceName) {
    console.log(
      `\n⚠ Could not resolve "${outcome.unresolvedPlaceName}" — searched without a location filter.`,
    );
  }

  console.log(`\n${outcome.stores.length} matching store(s):`);
  for (const [index, store] of outcome.stores.entries()) {
    const distance =
      store.distanceMeters === null ? "" : ` — ${(store.distanceMeters / 1000).toFixed(1)} km`;
    console.log(
      `${String(index + 1).padStart(3)}. ${store.name}${distance}\n     ${store.streetAddress}, ${store.city}, ${store.state} ${store.postalCode} · ${store.phone}`,
    );
  }

  await db.$client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
