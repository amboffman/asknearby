import { describe, expect, it } from "vitest";

import { buildSearchSuffix, softRedirectTarget } from "./soft-404";

describe("softRedirectTarget", () => {
  it("redirects one level up", () => {
    expect(softRedirectTarget(["stores", "oh", "columbus", "closed-store"])).toBe(
      "/stores/oh/columbus",
    );
    expect(softRedirectTarget(["stores", "oh"])).toBe("/stores");
  });

  it("redirects a single unknown segment to the root", () => {
    expect(softRedirectTarget(["stores"])).toBe("/");
  });

  it("preserves the query string across the hop", () => {
    expect(softRedirectTarget(["stores", "oh"], "?q=parking")).toBe("/stores?q=parking");
  });

  it("re-encodes decoded segments in the target path", () => {
    expect(softRedirectTarget(["a b", "café", "x"])).toBe("/a%20b/caf%C3%A9");
  });

  it("hard-404s unknown api paths instead of redirecting", () => {
    expect(softRedirectTarget(["api"])).toBeNull();
    expect(softRedirectTarget(["api", "bogus"])).toBeNull();
  });

  it("hard-404s api paths case-insensitively (prod routing is case-sensitive)", () => {
    expect(softRedirectTarget(["API", "search"])).toBeNull();
    expect(softRedirectTarget(["Api", "bogus"])).toBeNull();
  });

  it("hard-404s asset-shaped paths", () => {
    expect(softRedirectTarget(["favicon.png"])).toBeNull();
    expect(softRedirectTarget(["img", "logo.svg"])).toBeNull();
    expect(softRedirectTarget(["wp-login.php"])).toBeNull();
    expect(softRedirectTarget(["site.webmanifest"])).toBeNull();
  });

  it("does not mistake dotted slugs for assets", () => {
    // Extensions start with a letter; ".2" and ".-louis" do not.
    expect(softRedirectTarget(["docs", "v1.2"])).toBe("/docs");
    expect(softRedirectTarget(["stores", "st.-louis"])).toBe("/stores");
  });

  it("hard-404s an empty segment list", () => {
    expect(softRedirectTarget([])).toBeNull();
  });
});

describe("buildSearchSuffix", () => {
  it("returns an empty string when there are no params", () => {
    expect(buildSearchSuffix({})).toBe("");
  });

  it("serializes single and repeated values", () => {
    expect(buildSearchSuffix({ q: "free parking" })).toBe("?q=free+parking");
    expect(buildSearchSuffix({ tag: ["a", "b"], skip: undefined })).toBe("?tag=a&tag=b");
  });
});
