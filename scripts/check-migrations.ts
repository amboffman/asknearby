// Guard for the hand-edited PostGIS migration (0001): drizzle-kit's
// snapshot still records the customType string, so a regenerated migration
// re-emits the quoted `"geography(Point,4326)"` form, which Postgres
// rejects as a literal type name. This runs after every `pnpm db:generate`
// and fails loudly instead of relying on a comment humans must remember.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "src", "lib", "db", "migrations");

const offenders = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .filter((file) =>
    readFileSync(join(migrationsDir, file), "utf8")
      .split("\n")
      // 0001's explanatory comment names the broken form on purpose.
      .filter((line) => !line.trimStart().startsWith("--"))
      .some((line) => line.includes('"geography(')),
  );

if (offenders.length > 0) {
  console.error(
    `Quoted geography type name found in: ${offenders.join(", ")}\n` +
      `Postgres rejects "geography(Point,4326)" as a literal type name.\n` +
      `Un-quote it by hand (see 0001_init-schema.sql for the working form).`,
  );
  process.exit(1);
}

console.log("check-migrations: no quoted geography(...) type names.");
