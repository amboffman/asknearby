// SQL-shape tests: build queries with a lazy (never-connecting) client and
// assert the generated SQL, so the query semantics are pinned without a
// database. Live PostGIS behavior is covered in queries.integration.test.ts.
import { describe, expect, it } from "vitest";

import { createDb } from "./client";
import { buildFindStoresQuery } from "./queries";

const db = createDb("postgres://unit-test@localhost:5432/never-connects");

const columbus = { latitude: 39.962, longitude: -83.001, radiusMeters: 8000 };

describe("buildFindStoresQuery", () => {
  it("radius search filters with ST_DWithin on geography and sorts by distance", () => {
    const { sql, params } = buildFindStoresQuery(db, { near: columbus }).toSQL();

    expect(sql).toContain("ST_DWithin");
    expect(sql).toContain("::geography");
    expect(sql).toMatch(/order by ST_Distance/i);
    // Parameter order within ST_MakePoint is (longitude, latitude).
    const lngIndex = params.indexOf(columbus.longitude);
    const latIndex = params.indexOf(columbus.latitude);
    expect(lngIndex).toBeGreaterThanOrEqual(0);
    expect(latIndex).toBe(lngIndex + 1);
    expect(params).toContain(columbus.radiusMeters);
  });

  it("emits one correlated EXISTS probe per required attribute", () => {
    const { sql, params } = buildFindStoresQuery(db, {
      requiredAttributeSlugs: ["mens-department", "free-parking"],
    }).toSQL();

    expect(sql.match(/exists/gi)).toHaveLength(2);
    expect(sql).toContain('"store_attributes"."store_id" = "stores"."id"');
    expect(params).toContain("mens-department");
    expect(params).toContain("free-parking");
  });

  it("selects a NULL distance and sorts by name when there is no center", () => {
    const { sql } = buildFindStoresQuery(db, {}).toSQL();

    expect(sql).not.toContain("ST_DWithin");
    expect(sql).toMatch(/NULL/);
    expect(sql).toMatch(/order by "stores"\."name"/i);
  });

  it("applies a default limit and honors an explicit one", () => {
    expect(buildFindStoresQuery(db, {}).toSQL().params).toContain(50);
    expect(buildFindStoresQuery(db, { limit: 5 }).toSQL().params).toContain(5);
  });

  it("maps camelCase fields to snake_case columns", () => {
    const { sql } = buildFindStoresQuery(db, {}).toSQL();

    expect(sql).toContain('"street_address"');
    expect(sql).toContain('"postal_code"');
  });
});
