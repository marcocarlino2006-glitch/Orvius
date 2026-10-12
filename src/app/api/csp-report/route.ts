import { NextResponse } from "next/server";
import { logWarn } from "@/lib/logger";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";

type Violation = { directive: string; blocked: string; page: string };

const clip = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : "");
/* Only the origin and path: a blocked URL's query string can carry a token. */
const strip = (v: unknown) => clip(v).split(/[?#]/)[0]!;

function violations(body: unknown): Violation[] {
  const list = Array.isArray(body) ? body : [body];
  return list.slice(0, 20).flatMap((item) => {
    const r = (item as { "csp-report"?: Record<string, unknown>; body?: Record<string, unknown> })?.["csp-report"] ??
      (item as { body?: Record<string, unknown> })?.body;
    if (!r || typeof r !== "object") return [];
    return [
      {
        directive: clip(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"]),
        blocked: strip(r["blocked-uri"] ?? r.blockedURL),
        page: strip(r["document-uri"] ?? r.documentURL),
      },
    ];
  });
}

/** Where browsers send report-only policy violations; logged so the policy can be tightened from real traffic. */
export async function POST(request: Request) {
  const limit = await sharedRateLimit({ key: `csp-report:${clientIp(request)}`, limit: 30, windowMs: 60_000 });
  if (!limit.ok) return new NextResponse(null, { status: 204 });
  const text = (await request.text().catch(() => "")).slice(0, 20_000);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  for (const v of violations(body)) logWarn("csp.violation", v);
  return new NextResponse(null, { status: 204 });
}
