import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so .env.local must be loaded by hand.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  // Migrations live inside lib/db: AGENTS.md makes it the only SQL home,
  // and the scaffold's .prettierignore already excludes this path.
  out: "./src/lib/db/migrations",
  casing: "snake_case",
  // Ignore PostGIS-owned system tables (spatial_ref_sys, …).
  extensionsFilters: ["postgis"],
  dbCredentials: {
    // Empty default keeps offline commands (`generate`) working without env.
    url: process.env.DATABASE_URL ?? "",
  },
});
