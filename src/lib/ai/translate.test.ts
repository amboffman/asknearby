import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { type Attribute } from "@/lib/types/store";

import { SEARCH_TOOL_NAME, TranslationFailedError, translateQuery } from "./translate";

const catalog: Attribute[] = [
  { slug: "mens-department", label: "Men's department", category: "department" },
  { slug: "free-parking", label: "Free parking", category: "parking" },
  { slug: "curbside-pickup", label: "Curbside pickup", category: "service" },
];

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 50, text: 50, reasoning: undefined },
};

function mockModelReturning(content: unknown[]) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: content as never,
      finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
      usage,
      warnings: [],
    }),
  });
}

function toolCallContent(input: unknown) {
  return [
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: SEARCH_TOOL_NAME,
      input: JSON.stringify(input),
    },
  ];
}

describe("translateQuery", () => {
  it("returns the parsed SearchQuery from the forced tool call", async () => {
    const model = mockModelReturning(
      toolCallContent({
        attributeSlugs: ["mens-department", "free-parking"],
        geo: { kind: "place", placeName: "Columbus" },
      }),
    );

    const query = await translateQuery(
      "stores with a men's department and free parking near Columbus",
      catalog,
      { model },
    );

    expect(query).toEqual({
      attributeSlugs: ["mens-department", "free-parking"],
      geo: { kind: "place", placeName: "Columbus" },
      openNow: false,
    });
  });

  it("applies schema defaults when the model omits optional fields", async () => {
    const model = mockModelReturning(toolCallContent({}));

    const query = await translateQuery("show me some stores", catalog, { model });

    expect(query).toEqual({
      attributeSlugs: [],
      geo: { kind: "none" },
      openNow: false,
    });
  });

  it("forces exactly one search_stores tool call with the catalog enum", async () => {
    const model = mockModelReturning(toolCallContent({}));
    await translateQuery("anything", catalog, { model });

    expect(model.doGenerateCalls).toHaveLength(1);
    const call = model.doGenerateCalls[0]!;

    expect(call.toolChoice).toEqual({ type: "tool", toolName: SEARCH_TOOL_NAME });
    expect(call.tools).toHaveLength(1);

    // The tool's JSON schema must close attributeSlugs over the catalog.
    const schemaJson = JSON.stringify(call.tools![0]);
    for (const attribute of catalog) {
      expect(schemaJson).toContain(attribute.slug);
    }

    // The system prompt carries label → slug hints from the catalog.
    const system = call.prompt.find((m) => m.role === "system");
    expect(JSON.stringify(system)).toContain("Men's department");
  });

  it("rejects when the model invents an attribute outside the catalog", async () => {
    const model = mockModelReturning(toolCallContent({ attributeSlugs: ["heliport"] }));

    await expect(translateQuery("stores with a heliport", catalog, { model })).rejects.toThrow(
      TranslationFailedError,
    );
  });

  it("throws TranslationFailedError when no tool call comes back", async () => {
    const model = mockModelReturning([{ type: "text", text: "Hello!" }]);

    await expect(translateQuery("anything", catalog, { model })).rejects.toThrow(
      TranslationFailedError,
    );
  });
});
