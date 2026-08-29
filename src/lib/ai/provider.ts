// Provider registry: the AI_PROVIDER switch (Week E). One place maps a
// provider name to an AI SDK LanguageModel; nothing else in the app knows
// which vendor is behind translateQuery.
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { type LanguageModel } from "ai";

export type AiProviderId = "anthropic" | "google";

export const AI_PROVIDERS: AiProviderId[] = ["anthropic", "google"];

/** Cheap/fast tier per provider (ADR-002: the translator is ~100 output tokens). */
export const DEFAULT_MODEL_IDS: Record<AiProviderId, string> = {
  anthropic: "claude-haiku-4-5",
  google: "gemini-3-flash-preview",
};

/**
 * USD per million tokens, verified against vendor pricing 2026-07-04.
 * Used ONLY for eval cost estimates, never billing.
 */
export const MODEL_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  "gemini-3-flash-preview": { input: 0.5, output: 3.0 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
};

export interface ResolvedModel {
  provider: AiProviderId;
  modelId: string;
  model: LanguageModel;
}

function isProviderId(value: string): value is AiProviderId {
  return value === "anthropic" || value === "google";
}

/**
 * Provider/model from explicit args, else env (AI_PROVIDER, AI_MODEL),
 * else defaults. API keys come from each provider's standard env var
 * (ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY).
 */
export function resolveModel(options: { provider?: string; modelId?: string } = {}): ResolvedModel {
  const provider = options.provider ?? process.env.AI_PROVIDER ?? "anthropic";
  if (!isProviderId(provider)) {
    throw new Error(
      `Unknown AI provider "${provider}". Expected one of: ${AI_PROVIDERS.join(", ")}.`,
    );
  }
  const modelId = options.modelId ?? process.env.AI_MODEL ?? DEFAULT_MODEL_IDS[provider];
  const model =
    provider === "anthropic" ? createAnthropic()(modelId) : createGoogleGenerativeAI()(modelId);
  return { provider, modelId, model };
}
