import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { clientIp, sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  confirmPublicJob,
  isVisitorId,
  newVisitorId,
  publicScenarios,
  runPublicScenario,
  VISITOR_COOKIE,
  visitorWorkspace,
} from "@/lib/public-demo";

const bodySchema = z.union([
  z.object({ scenario: z.string().min(1).max(40) }),
  z.object({ confirmJobId: z.string().min(1).max(64) }),
]);

export async function GET() {
  return NextResponse.json({ scenarios: publicScenarios() });
}

/** Signed-out demo: each visitor gets a throwaway demo shop running the real pipeline with simulated texts. */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limited = await sharedRateLimit({ key: `public-demo:${ip}`, limit: 20, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a scenario" }, { status: 400 });

  const jar = await cookies();
  const existingId = jar.get(VISITOR_COOKIE)?.value;
  const visitorId = isVisitorId(existingId) ? existingId : newVisitorId();
  let business = await visitorWorkspace(visitorId, false);
  if (!business) {
    const shops = await sharedRateLimit({ key: `public-demo-shop:${ip}`, limit: 5, windowMs: 60 * 60_000 });
    if (!shops.ok) return tooManyRequests(shops.retryAfterSec, "Too many demo shops from this network. Try again later.");
    business = await visitorWorkspace(visitorId, true);
  }
  if (!business) return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });

  try {
    const payload =
      "confirmJobId" in parsed.data
        ? await confirmPublicJob(business, parsed.data.confirmJobId)
        : await runPublicScenario(business, parsed.data.scenario);
    const response = NextResponse.json({ ok: true, ...payload });
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo run failed" }, { status: 400 });
  }
}
