import { NextResponse } from "next/server";
import { z } from "zod";
import { DEMO_SCENARIOS, simulateCustomerConfirm, simulateDemoCall } from "@/lib/demo-workspace";
import { processNotificationQueue } from "@/lib/notifications";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { requireEntitledSession } from "@/lib/tenant";

const bodySchema = z.union([
  z.object({ scenario: z.string().min(1) }),
  z.object({ confirmJobId: z.string().min(1) }),
]);

export async function GET() {
  return NextResponse.json({
    scenarios: DEMO_SCENARIOS.map((s) => ({ id: s.id, label: s.label, expect: s.expect })),
  });
}

/** Demo workspaces only: place a scripted call, or tap a customer's confirm link. */
export async function POST(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  if (business.environment !== "demo") {
    return NextResponse.json({ error: "Simulations only run in a demo workspace. Your real line takes real calls." }, { status: 403 });
  }
  const limited = await sharedRateLimit({ key: `demo-sim:${business.id}`, limit: 20, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a scenario" }, { status: 400 });
  try {
    if ("confirmJobId" in parsed.data) {
      const result = await simulateCustomerConfirm(business, parsed.data.confirmJobId);
      return NextResponse.json(result.ok ? { ok: true, already: result.already } : { error: result.error }, { status: result.ok ? 200 : 409 });
    }
    const result = await simulateDemoCall(business, parsed.data.scenario);
    await processNotificationQueue(10, { businessId: business.id });
    return NextResponse.json({
      ok: true,
      scenario: result.scenario.id,
      leadId: result.duplicate ? null : result.leadId,
      jobId: result.duplicate ? null : result.jobId,
      autoBooked: result.duplicate ? false : result.autoBooked,
      skipReason: result.duplicate ? null : result.skipReason,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulation failed" }, { status: 400 });
  }
}
