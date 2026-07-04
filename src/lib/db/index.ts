// Public surface of lib/db. Consumers (lib/search, scripts) import from
// here and receive domain types — schema internals stay in this layer.
export { type Db, getDb } from "./client";
export {
  buildFindStoresQuery,
  countStoresPerAttribute,
  type FindStoresFilters,
  findStores,
  getStoreDetails,
  listAttributes,
  type NearFilter,
  UnknownAttributeError,
} from "./queries";
export { applySeed, generateSeedData } from "./seed";
