// Cost protection (Week D, the MLIP pattern): a per-IP rate limit plus a
// global daily budget breaker in front of every paid model call. Counters
// live in Postgres because serverless instances share no memory.
import { type Db, incrementUsageCounter } from "@/lib/db";

export interface CostGuardLimits {
  /** Requests per IP per minute window. */
  perIpPerMinute: number;
  /** Total AI-calling requests per UTC day, all users combined. */
  dailyBudget: number;
}

export function limitsFromEnv(): CostGuardLimits {
  return {
    perIpPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10),
    dailyBudget: Number(process.env.DAILY_AI_REQUEST_BUDGET ?? 300),
  };
}

export type CostGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ip_rate_limited" | "daily_budget_exhausted";
      retryAfterSeconds: number;
    };

/**
 * Increment-then-check: the request being judged is already counted, so
 * a burst can never slip through between read and write.
 */
export async function checkCostGuard(
  db: Db,
  ip: string,
  limits: CostGuardLimits = limitsFromEnv(),
  now: Date = new Date(),
): Promise<CostGuardResult> {
  const minuteWindow = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const ipCount = await incrementUsageCounter(db, `ip:${ip}:${minuteWindow}`, 120);
  if (ipCount > limits.perIpPerMinute) {
    return { allowed: false, reason: "ip_rate_limited", retryAfterSeconds: 60 };
  }

  const day = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const dayCount = await incrementUsageCounter(db, `global:${day}`, 60 * 60 * 48);
  if (dayCount > limits.dailyBudget) {
    return {
      allowed: false,
      reason: "daily_budget_exhausted",
      retryAfterSeconds: secondsUntilNextUtcDay(now),
    };
  }

  return { allowed: true };
}

function secondsUntilNextUtcDay(now: Date): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 1000));
}
