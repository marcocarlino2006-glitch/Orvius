/**
 * Simple in-memory rate limit for public routes.
 * Good enough for single-node Vercel until Redis.
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
