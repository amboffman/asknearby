// Public surface of lib/db. Consumers (lib/search, scripts) import from
// here and receive domain types — schema internals stay in this layer.
export { type Db, getDb } from "./client";
export {
  buildFindStoresQuery,
  countStores,
  countStoresPerAttribute,
  type FindStoresFilters,
  findStores,
  getStoreDetails,
  incrementUsageCounter,
  listAttributes,
  listHoursForStores,
  type NearFilter,
  STORE_RESULT_LIMIT,
  UnknownAttributeError,
} from "./queries";
export { applySeed, generateSeedData } from "./seed";
