import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

export interface CreateDbOptions {
  /**
   * Pool size per client. postgres.js defaults to 10, which multiplied by
   * warm serverless instances can exhaust Supavisor's client-connection
   * cap; scripts/tests may pass more.
   */
  max?: number;
}

/**
 * postgres.js connects lazily (first query), so this is also safe for
 * unit tests that only build SQL via `.toSQL()` and never execute.
 */
export function createDb(url: string, { max = 4 }: CreateDbOptions = {}) {
  // prepare:false keeps the client compatible with Supabase's transaction-
  // mode pooler (port 6543), which does not support prepared statements.
  // idle_timeout releases pooled connections instead of holding them for
  // the life of the (possibly long-lived) serverless instance.
  const client = postgres(url, { prepare: false, max, idle_timeout: 20, connect_timeout: 10 });
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
