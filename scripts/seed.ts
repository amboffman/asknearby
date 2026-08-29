// pnpm seed: deterministic reseed of the database (truncates first).
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { getDb } from "../src/lib/db/client";
import { applySeed, generateSeedData } from "../src/lib/db/seed";

async function main() {
  const data = generateSeedData();
  const db = getDb();
  const summary = await applySeed(db, data);

  console.log(`Seeded ${summary.storeCount} stores, ${summary.attributeCount} attributes.`);
  for (const [state, count] of Object.entries(summary.storesByState).sort()) {
    console.log(`  ${state}: ${count} stores`);
  }
  await db.$client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
