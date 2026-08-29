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

/**
 * A malformed value must not fail open: `Number("ten")` is NaN and every
 * `count > NaN` comparison is false, which would silently disable the
 * guard entirely (and `Number("")` is 0, which would block everyone).
 */
function positiveIntFromEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function limitsFromEnv(): CostGuardLimits {
  return {
    perIpPerMinute: positiveIntFromEnv(process.env.RATE_LIMIT_PER_MINUTE, 10),
    dailyBudget: positiveIntFromEnv(process.env.DAILY_AI_REQUEST_BUDGET, 300),
  };
}

/**
 * The counter key for a caller. Vercel overwrites `x-forwarded-for` with
 * the real client IP; on any other host the header is client-forgeable,
 * so this is best-effort keying, not authentication. Empty/oversized
 * values collapse to "local" rather than minting attacker-chosen keys.
 */
export function clientIpFrom(request: Request): string {
  const ip = (
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    ""
  ).trim();
  return ip.length > 0 && ip.length <= 64 ? ip : "local";
}

export type CostGuardResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "ip_rate_limited" | "daily_budget_exhausted";
      retryAfterSeconds: number;
    };

/**
 * The per-IP minute window alone, shared by the AI spine and the
 * deterministic query endpoint (which must not draw down the AI daily
 * budget since it never calls a model).
 */
export async function checkIpRateLimit(
  db: Db,
  ip: string,
  perIpPerMinute: number = limitsFromEnv().perIpPerMinute,
  now: Date = new Date(),
): Promise<CostGuardResult> {
  const minuteWindow = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const ipCount = await incrementUsageCounter(db, `ip:${ip}:${minuteWindow}`, 120);
  if (ipCount > perIpPerMinute) {
    // The window is minute-aligned, so it resets at the next :00.
    const retryAfterSeconds = Math.max(1, 60 - now.getUTCSeconds());
    return { allowed: false, reason: "ip_rate_limited", retryAfterSeconds };
  }
  return { allowed: true };
}

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
  const ipResult = await checkIpRateLimit(db, ip, limits.perIpPerMinute, now);
  if (!ipResult.allowed) return ipResult;

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
