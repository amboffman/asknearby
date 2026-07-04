import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

function createDb(url: string) {
  // prepare:false keeps the client compatible with Supabase's transaction-
  // mode pooler (port 6543), which does not support prepared statements.
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}

let db: Db | undefined;

/**
 * Lazy singleton so importing lib/db never requires DATABASE_URL at module
 * load (Next.js builds and unit tests must work without a database).
 */
export function getDb(): Db {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and fill in the Supabase connection string.",
      );
    }
    db = createDb(url);
  }
  return db;
}
