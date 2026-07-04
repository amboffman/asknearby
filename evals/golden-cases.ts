// Golden NL → SearchQuery cases (Week E). Expectations are derived from
// the seeded attribute catalog; scoring is deterministic (see scorers.ts).
// NEVER run in CI — each case is a paid model call (pnpm eval).
import { type SearchQuery, searchQuerySchema } from "@/lib/types/search-query";

export interface GoldenCase {
  name: string;
  input: string;
  expected: SearchQuery;
}

function expected(partial: unknown): SearchQuery {
  return searchQuerySchema.parse(partial);
}

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: "flagship: two attributes + place",
    input: "stores with a men's department and free parking near Columbus",
    expected: expected({
      attributeSlugs: ["mens-department", "free-parking"],
      geo: { kind: "place", placeName: "Columbus" },
    }),
  },
  {
    name: "synonym: shoes → footwear",
    input: "where can I buy shoes in Cincinnati?",
    expected: expected({
      attributeSlugs: ["footwear"],
      geo: { kind: "place", placeName: "Cincinnati" },
    }),
  },
  {
    name: "open now, no location",
    input: "which locations are open right now?",
    expected: expected({ openNow: true }),
  },
  {
    name: "place only",
    input: "stores near Indianapolis",
    expected: expected({ geo: { kind: "place", placeName: "Indianapolis" } }),
  },
  {
    name: "explicit km radius",
    input: "outdoor gear and EV charging within 5 km of Chicago",
    expected: expected({
      attributeSlugs: ["outdoor-gear", "ev-charging"],
      geo: { kind: "place", placeName: "Chicago" },
      radiusKm: 5,
    }),
  },
  {
    name: "task phrasing: suit altered → alterations",
    input: "I need my suit altered somewhere downtown Columbus",
    expected: expected({
      attributeSlugs: ["alterations"],
      geo: { kind: "place", placeName: "downtown Columbus" },
    }),
  },
  {
    name: "kids clothing",
    input: "kid's clothing near Naperville",
    expected: expected({
      attributeSlugs: ["kids-department"],
      geo: { kind: "place", placeName: "Naperville" },
    }),
  },
  {
    name: "BOPIS phrasing",
    input: "can I pick up an online order at a store in Mason?",
    expected: expected({
      attributeSlugs: ["buy-online-pickup-in-store"],
      geo: { kind: "place", placeName: "Mason" },
    }),
  },
  {
    name: "attribute + open now + place",
    input: "pet friendly stores open now near Westerville",
    expected: expected({
      attributeSlugs: ["pet-friendly"],
      geo: { kind: "place", placeName: "Westerville" },
      openNow: true,
    }),
  },
  {
    name: "accessibility + parking type",
    input: "wheelchair accessible locations with a parking garage in Chicago",
    expected: expected({
      attributeSlugs: ["wheelchair-accessible", "parking-garage"],
      geo: { kind: "place", placeName: "Chicago" },
    }),
  },
  {
    name: "no filters at all",
    input: "show me all your stores",
    expected: expected({}),
  },
  {
    name: "indirect phrasing: park for free",
    input: "somewhere to park for free near Grove City",
    expected: expected({
      attributeSlugs: ["free-parking"],
      geo: { kind: "place", placeName: "Grove City" },
    }),
  },
  {
    name: "miles → km conversion",
    input: "curbside pickup within 10 miles of Fishers",
    expected: expected({
      attributeSlugs: ["curbside-pickup"],
      geo: { kind: "place", placeName: "Fishers" },
      radiusKm: 16.1,
    }),
  },
  {
    name: "two attributes, suburban place",
    input: "women's clothing and personal styling in Carmel",
    expected: expected({
      attributeSlugs: ["womens-department", "personal-styling"],
      geo: { kind: "place", placeName: "Carmel" },
    }),
  },
  {
    name: "near me: location fields must stay empty",
    input: "any stores near me open right now?",
    expected: expected({ openNow: true }),
  },
  {
    name: "explicit coordinates",
    input: "stores around 39.96, -83.00",
    expected: expected({
      geo: { kind: "coordinates", latitude: 39.96, longitude: -83.0 },
    }),
  },
  {
    name: "three attributes",
    input: "men's and women's departments with curbside pickup near Cincinnati",
    expected: expected({
      attributeSlugs: ["mens-department", "womens-department", "curbside-pickup"],
      geo: { kind: "place", placeName: "Cincinnati" },
    }),
  },
  {
    name: "negation: explicitly not a filter",
    input: "I don't care about parking, just need footwear near Dublin Ohio",
    expected: expected({
      attributeSlugs: ["footwear"],
      geo: { kind: "place", placeName: "Dublin Ohio" },
    }),
  },
  {
    name: "honesty: requested attribute not in catalog",
    input: "gift wrapping services in Columbus",
    expected: expected({ geo: { kind: "place", placeName: "Columbus" } }),
  },
  {
    name: "attributes + open now + urban neighborhood",
    input: "stores with alterations and free parking open now in Oakley",
    expected: expected({
      attributeSlugs: ["alterations", "free-parking"],
      geo: { kind: "place", placeName: "Oakley" },
      openNow: true,
    }),
  },
];
