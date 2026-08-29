// pnpm eval [provider...]: run the golden cases against each configured
// AI provider and write an accuracy/latency/cost matrix to eval-reports/.
// COSTS MONEY (one model call per case per provider). Never wire into CI.
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { translateQueryDetailed } from "../src/lib/ai/translate";
import {
  AI_PROVIDERS,
  type AiProviderId,
  DEFAULT_MODEL_IDS,
  MODEL_PRICING_USD_PER_MTOK,
  resolveModel,
} from "../src/lib/ai/provider";
import { ATTRIBUTE_CATALOG } from "../src/lib/db/seed-data";
import { GOLDEN_CASES } from "../evals/golden-cases";
import { type CaseScore, FIELD_NAMES, scoreCase } from "../evals/scorers";

const KEY_ENV: Record<AiProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

// Pacing between cases: Gemini's free tier allows 5 requests/minute for
// gemini-3-flash (observed live), so stay just under it.
const INTER_CASE_DELAY_MS: Record<AiProviderId, number> = {
  anthropic: 0,
  google: 13_000,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface CaseResult {
  name: string;
  input: string;
  pass: boolean;
  fields?: CaseScore["fields"];
  latencyMs: number;
  costUsd: number | null;
  error?: string;
  actual?: unknown;
  expected: unknown;
}

interface ProviderReport {
  provider: AiProviderId;
  modelId: string;
  ranAt: string;
  cases: CaseResult[];
  summary: {
    passRate: number;
    errorCount: number;
    fieldAccuracy: Record<string, number>;
    meanLatencyMs: number;
    p50LatencyMs: number;
    meanCostUsd: number | null;
  };
}

function costOf(
  modelId: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
): number | null {
  const pricing = MODEL_PRICING_USD_PER_MTOK[modelId];
  if (!pricing || usage.inputTokens === null || usage.outputTokens === null) return null;
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
}

async function runProvider(provider: AiProviderId): Promise<ProviderReport> {
  const { model, modelId } = resolveModel({
    provider,
    // Per-provider defaults; AI_MODEL would apply to both, which is wrong here.
    modelId: DEFAULT_MODEL_IDS[provider],
  });
  console.log(`\n▶ ${provider} (${modelId}): ${GOLDEN_CASES.length} cases`);

  const cases: CaseResult[] = [];
  for (const goldenCase of GOLDEN_CASES) {
    if (cases.length > 0 && INTER_CASE_DELAY_MS[provider] > 0) {
      await sleep(INTER_CASE_DELAY_MS[provider]);
    }
    try {
      const result = await translateQueryDetailed(goldenCase.input, ATTRIBUTE_CATALOG, {
        model,
      });
      const score = scoreCase(goldenCase.expected, result.query);
      cases.push({
        name: goldenCase.name,
        input: goldenCase.input,
        pass: score.pass,
        fields: score.fields,
        latencyMs: Math.round(result.latencyMs),
        costUsd: costOf(modelId, result.usage),
        actual: result.query,
        expected: goldenCase.expected,
      });
      console.log(`  ${score.pass ? "✓" : "✗"} ${goldenCase.name}`);
    } catch (error) {
      cases.push({
        name: goldenCase.name,
        input: goldenCase.input,
        pass: false,
        latencyMs: 0,
        costUsd: null,
        error: error instanceof Error ? error.message : String(error),
        expected: goldenCase.expected,
      });
      console.log(`  ✗ ${goldenCase.name} (error: ${String(error).slice(0, 80)})`);
    }
  }

  const scored = cases.filter((c) => !c.error);
  const latencies = scored.map((c) => c.latencyMs).sort((a, b) => a - b);
  const costs = scored.map((c) => c.costUsd).filter((c): c is number => c !== null);
  const fieldAccuracy = Object.fromEntries(
    FIELD_NAMES.map((field) => [
      field,
      scored.length === 0 ? 0 : scored.filter((c) => c.fields?.[field]).length / scored.length,
    ]),
  );

  return {
    provider,
    modelId,
    ranAt: new Date().toISOString(),
    cases,
    summary: {
      passRate: cases.length === 0 ? 0 : cases.filter((c) => c.pass).length / cases.length,
      errorCount: cases.filter((c) => c.error).length,
      fieldAccuracy,
      meanLatencyMs:
        latencies.length === 0
          ? 0
          : Math.round(latencies.reduce((s, v) => s + v, 0) / latencies.length),
      p50LatencyMs: latencies[Math.floor(latencies.length / 2)] ?? 0,
      meanCostUsd: costs.length === 0 ? null : costs.reduce((s, v) => s + v, 0) / costs.length,
    },
  };
}

function matrixMarkdown(reports: ProviderReport[]): string {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const lines = [
    `# Model comparison (${new Date().toISOString().slice(0, 10)})`,
    "",
    `${GOLDEN_CASES.length} golden NL → SearchQuery cases; deterministic field-by-field scoring.`,
    "",
    "| Provider | Model | Pass rate | Errors | Attributes | Geo kind | Place | Radius | Open now | Mean latency | p50 | Est. cost/query |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...reports.map((r) =>
      [
        r.provider,
        r.modelId,
        pct(r.summary.passRate),
        String(r.summary.errorCount),
        ...FIELD_NAMES.map((f) => pct(r.summary.fieldAccuracy[f] ?? 0)),
        `${r.summary.meanLatencyMs} ms`,
        `${r.summary.p50LatencyMs} ms`,
        r.summary.meanCostUsd === null ? "n/a" : `$${r.summary.meanCostUsd.toFixed(6)}`,
      ].join(" | "),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const requested = process.argv.slice(2) as AiProviderId[];
  const providers = (requested.length > 0 ? requested : AI_PROVIDERS).filter((p) => {
    if (!AI_PROVIDERS.includes(p)) {
      console.error(`Unknown provider "${p}"; expected: ${AI_PROVIDERS.join(", ")}`);
      process.exit(1);
    }
    if (!process.env[KEY_ENV[p]]) {
      console.warn(`⚠ Skipping ${p}: ${KEY_ENV[p]} is not set.`);
      return false;
    }
    return true;
  });
  if (providers.length === 0) {
    console.error("No providers have API keys configured.");
    process.exit(1);
  }

  const reports: ProviderReport[] = [];
  for (const provider of providers) {
    reports.push(await runProvider(provider));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const dir = path.join(process.cwd(), "eval-reports");
  mkdirSync(dir, { recursive: true });
  for (const report of reports) {
    writeFileSync(
      path.join(dir, `${stamp}-${report.provider}.json`),
      JSON.stringify(report, null, 2),
    );
  }
  const matrix = matrixMarkdown(reports);
  writeFileSync(path.join(dir, `${stamp}-matrix.md`), matrix);

  console.log(`\n${matrix}`);
  console.log(`Reports written to eval-reports/${stamp}-*.{json,md}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
