import { describe, expect, it } from "vitest";

import { POST } from "./route";

function post(body: unknown): Request {
  return new Request("http://localhost/api/search/query", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/search/query", () => {
  it("rejects malformed bodies with 400", async () => {
    const response = await POST(post({ nope: true }));
    expect(response.status).toBe(400);
  });

  it("rejects non-JSON bodies with 400", async () => {
    const response = await POST(
      new Request("http://localhost/api/search/query", { method: "POST", body: "not json" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects geo.kind 'place' with 400 before touching the database", async () => {
    // Unit tests run without DATABASE_URL, so reaching the DB would 500;
    // a 400 proves the paid-geocode path is refused up front (ADR-004:
    // this endpoint must never pay the geocoder).
    const response = await POST(
      post({
        query: {
          attributeSlugs: [],
          geo: { kind: "place", placeName: "Columbus" },
          openNow: false,
        },
      }),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/place/i);
  });
});
