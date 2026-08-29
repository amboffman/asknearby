// searchStores truncation contract (limit+1 probe) with a mocked lib/db:
// the live dataset (75 stores) can't exceed STORE_RESULT_LIMIT, so this
// behavior is only exercisable with a stub.
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type Db, findStores } from "@/lib/db";
import { searchQuerySchema } from "@/lib/types/search-query";
import { type StoreSearchResult } from "@/lib/types/store";

import { searchStores } from "./index";

vi.mock("@/lib/db", () => ({
  findStores: vi.fn(),
  countStores: vi.fn(),
  countStoresPerAttribute: vi.fn(),
  listHoursForStores: vi.fn(),
  STORE_RESULT_LIMIT: 100,
}));

const mockedFindStores = vi.mocked(findStores);
const db = {} as Db;
const deps = { geocoder: { geocode: () => Promise.resolve(null) } };

function fakeStore(id: number): StoreSearchResult {
  return {
    id,
    slug: `store-${id}`,
    name: `Store ${id}`,
    streetAddress: "1 Main St",
    city: "Columbus",
    state: "OH",
    postalCode: "43004",
    phone: "(614) 555-0100",
    timezone: "America/New_York",
    latitude: 39.9,
    longitude: -83.0,
    distanceMeters: null,
  };
}

beforeEach(() => {
  mockedFindStores.mockReset();
});

describe("searchStores truncation", () => {
  it("probes limit+1, slices to the limit, and sets the flag on overflow", async () => {
    mockedFindStores.mockResolvedValueOnce(Array.from({ length: 101 }, (_, i) => fakeStore(i + 1)));

    const outcome = await searchStores(db, searchQuerySchema.parse({}), deps);

    expect(mockedFindStores).toHaveBeenCalledWith(db, expect.objectContaining({ limit: 101 }));
    expect(outcome.stores).toHaveLength(100);
    expect(outcome.truncated).toBe(true);
  });

  it("omits the flag when everything fits", async () => {
    mockedFindStores.mockResolvedValueOnce([fakeStore(1)]);

    const outcome = await searchStores(db, searchQuerySchema.parse({}), deps);

    expect(outcome.stores).toHaveLength(1);
    expect(outcome.truncated).toBeUndefined();
  });
});
