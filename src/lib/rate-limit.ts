import { prisma } from "@/lib/prisma";

/**
 * In-memory rate limit. Each serverless instance counts on its own, so use
 * sharedRateLimit for anything that sends texts, emails or accepts tokens.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const current = buckets.get(params.key);
  if (!current || current.resetAt <= now) {
    buckets.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return { ok: true, remaining: params.limit - 1, retryAfterSec: 0 };
  }
  if (current.count >= params.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }
  current.count += 1;
  return {
    ok: true,
    remaining: params.limit - current.count,
    retryAfterSec: 0,
  };
}

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function tooManyRequests(retryAfterSec: number, message = "Too many requests. Wait a moment and retry.") {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) },
  });
}

/**
 * Throttle only failed webhook authentication. Real providers never fail it, so
 * legitimate bursts (thirty calls ending at once) are never slowed; someone
 * guessing secrets is.
 */
export function webhookAuthFailureLimited(request: Request, source: string) {
  return rateLimit({ key: `authfail:${source}:${clientIp(request)}`, limit: 20, windowMs: 60_000 });
}

type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * Rate limit counted in the database, so every server instance sees the same
 * count. One atomic upsert per request. Falls back to the in-memory limiter if
 * the database is unreachable, so an outage never blocks real requests.
 */
export async function sharedRateLimit(params: { key: string; limit: number; windowMs: number }): Promise<RateLimitResult> {
  const now = Date.now();
  const resetAt = now + params.windowMs;
  try {
    const rows = await prisma.$queryRaw<Array<{ count: number | bigint; resetAtMs: number | bigint }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAtMs") VALUES (${params.key}, 1, ${resetAt})
      ON CONFLICT("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAtMs" <= ${now} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAtMs" = CASE WHEN "RateLimitBucket"."resetAtMs" <= ${now} THEN ${resetAt} ELSE "RateLimitBucket"."resetAtMs" END
      RETURNING "count", "resetAtMs"`;
    const row = rows[0];
    if (!row) return rateLimit(params);
    const count = Number(row.count);
    if (Math.random() < 0.01) {
      void prisma.rateLimitBucket.deleteMany({ where: { resetAtMs: { lt: BigInt(now) } } }).catch(() => {});
    }
    if (count > params.limit) {
      return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((Number(row.resetAtMs) - now) / 1000)) };
    }
    return { ok: true, remaining: params.limit - count, retryAfterSec: 0 };
  } catch {
    return rateLimit(params);
  }
}

/**
 * Customer links (confirm, deposit, estimate, tech, calendar) are public and
 * token-addressed. The limit stops token guessing and scripted abuse, but sits
 * far above what a customer tapping a link, or a calendar app polling, sends.
 */
export async function publicTokenLimited(request: Request, route: string, method: string): Promise<Response | null> {
  const write = method !== "GET";
  const limited = await sharedRateLimit({
    key: `public:${route}:${write ? "write" : "read"}:${clientIp(request)}`,
    limit: write ? 20 : 120,
    windowMs: 60_000,
  });
  return limited.ok ? null : tooManyRequests(limited.retryAfterSec);
}
