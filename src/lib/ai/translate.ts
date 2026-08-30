// lib/ai: Vercel AI SDK orchestration (layer boundary: server-only;
// no SQL, no JSX, no maps-vendor calls). The model's ONLY job is one forced
// tool call: natural language → typed SearchQuery (ADR-001).
import { generateText, type LanguageModel, tool } from "ai";

import {
  buildSearchQueryToolSchema,
  type SearchQuery,
  toSearchQuery,
} from "@/lib/types/search-query";
import { type Attribute } from "@/lib/types/store";

import { resolveModel } from "./provider";

export const SEARCH_TOOL_NAME = "search_stores";

export class TranslationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationFailedError";
  }
}

export interface TranslateOptions {
  /** Injected in tests (MockLanguageModelV4) and evals; defaults to the
   * AI_PROVIDER/AI_MODEL-configured model (lib/ai/provider). */
  model?: LanguageModel;
}

export interface TranslationResult {
  query: SearchQuery;
  latencyMs: number;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

function systemPrompt(catalog: readonly Attribute[]): string {
  const catalogLines = catalog.map((a) => `- ${a.slug}: ${a.label} (${a.category})`).join("\n");
  return [
    "You translate store-locator requests into a structured search query",
    "for a retail chain. Capture ONLY what the user actually asked for:",
    "attributes from the catalog below, a place or coordinates if one was",
    "named, a radius only if stated, openNow only if they want stores open",
    "right now. Never invent filters, places, or radii. If they say",
    '"near me" or "nearby" without naming a place, leave the location',
    "fields empty; the app supplies the user's location.",
    "",
    "Attribute catalog (slug: label):",
    catalogLines,
  ].join("\n");
}

/**
 * Natural language → SearchQuery via ONE forced tool call. The tool schema
 * closes the attribute enum over the live catalog, so the model cannot
 * return an attribute the database does not know (ADR-001).
 */
export async function translateQuery(
  input: string,
  catalog: readonly Attribute[],
  options: TranslateOptions = {},
): Promise<SearchQuery> {
  const { query } = await translateQueryDetailed(input, catalog, options);
  return query;
}

/** translateQuery plus latency + token usage: what the eval harness scores. */
export async function translateQueryDetailed(
  input: string,
  catalog: readonly Attribute[],
  options: TranslateOptions = {},
): Promise<TranslationResult> {
  const wireSchema = buildSearchQueryToolSchema(catalog.map((a) => a.slug));
  const startedAt = performance.now();
  const result = await generateText({
    model: options.model ?? resolveModel().model,
    system: systemPrompt(catalog),
    prompt: input,
    tools: {
      [SEARCH_TOOL_NAME]: tool({
        description:
          "Search the store database. Every field is optional. Emit only what the user asked for.",
        inputSchema: wireSchema,
      }),
    },
    toolChoice: { type: "tool", toolName: SEARCH_TOOL_NAME },
  });
  const latencyMs = performance.now() - startedAt;

  const call = result.toolCalls.find((c) => c.toolName === SEARCH_TOOL_NAME);
  if (!call) {
    throw new TranslationFailedError(
      `Model returned no ${SEARCH_TOOL_NAME} tool call (finish reason: ${result.finishReason}).`,
    );
  }
  // Re-validate ourselves: the AI SDK marks schema-invalid tool calls
  // instead of throwing, and the catalog enum must be enforced here, not
  // trusted (ADR-001: silent bad filters are the failure mode to prevent).
  const parsed = wireSchema.safeParse(call.input);
  if (!parsed.success) {
    throw new TranslationFailedError(
      `Model emitted an invalid SearchQuery: ${parsed.error.message}`,
    );
  }
  return {
    query: toSearchQuery(parsed.data),
    latencyMs,
    usage: {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
    },
  };
}
