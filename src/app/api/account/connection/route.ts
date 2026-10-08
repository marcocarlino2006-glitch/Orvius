import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { normalizePhone } from "@/lib/customer";
import { latestForwardTest } from "@/lib/forward-test";
import { CARRIER_PATHS, connectionHealth, type Coverage } from "@/lib/number-connection";
import { getShopLine } from "@/lib/owner-setup-state";
import { prisma } from "@/lib/prisma";
import { isSetupSandbox } from "@/lib/setup-flow";
import { requireEntitledSession } from "@/lib/tenant";

const CARRIER_IDS = ["verizon", "att", "tmobile", "other", "voip"] as const;
const COVERAGES = ["missed", "all", "after_hours", "main"] as const;

async function view(businessId: string) {
  const b = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const last = await latestForwardTest(businessId);
  const line = getShopLine(b);
  return {
    line,
    businessNumber: b.phone,
    carrier: b.forwardCarrier ?? null,
    coverage: (b.forwardCoverage ?? (b.captureMode === "publish" ? "main" : null)) as Coverage | null,
    provenAt: b.overflowProvedAt?.toISOString() ?? null,
    confirmedAt: b.overflowForwardConfirmedAt?.toISOString() ?? null,
    testMode: isSetupSandbox(b),
    lastTest: last ? { state: last.state, title: last.title ?? "", at: last.startedAt.toISOString() } : null,
    health: connectionHealth({
      testMode: isSetupSandbox(b),
      line,
      provenAt: b.overflowProvedAt,
      lastTest: last ? { state: last.state, title: last.title ?? "", at: last.startedAt } : null,
    }),
  };
}

export async function GET() {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await view(auth.business.id));
}

const patchSchema = z.object({
  businessNumber: z.string().max(40).optional(),
  carrier: z.enum(CARRIER_IDS).optional(),
  coverage: z.enum(COVERAGES).optional(),
});

export async function PATCH(request: NextRequest) {
  const auth = await requireEntitledSession();
  if ("error" in auth) return auth.error;
  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "That didn't save. Check the fields and try again." }, { status: 400 });
  }
  const data: Record<string, string | null> = {};
  if (body.businessNumber !== undefined) {
    const normalized = body.businessNumber.trim() ? normalizePhone(body.businessNumber) : null;
    if (body.businessNumber.trim() && !normalized) {
      return NextResponse.json({ error: "That doesn't look like a phone number. Use the 10-digit number customers call." }, { status: 400 });
    }
    const line = getShopLine(auth.business);
    if (normalized && line && normalizePhone(line) === normalized) {
      return NextResponse.json({ error: "That's your Orvius number. Enter the number customers call today." }, { status: 400 });
    }
    data.phone = normalized;
  }
  const carrier = body.carrier ?? auth.business.forwardCarrier ?? null;
  if (body.carrier) data.forwardCarrier = body.carrier;
  if (body.coverage) {
    const allowed = carrier ? CARRIER_PATHS[carrier as keyof typeof CARRIER_PATHS]?.coverages : COVERAGES;
    if (allowed && !allowed.includes(body.coverage)) {
      return NextResponse.json({ error: "That kind of line can't do that on its own. Pick another option." }, { status: 400 });
    }
    data.forwardCoverage = body.coverage;
    data.captureMode = body.coverage === "main" ? "publish" : "forward";
  }
  const changesRouting =
    (data.phone !== undefined && data.phone !== auth.business.phone) ||
    (data.forwardCoverage !== undefined && data.forwardCoverage !== auth.business.forwardCoverage);
  await prisma.business.update({
    where: { id: auth.business.id },
    // A new number or coverage hasn't been proven yet; the old proof doesn't carry over.
    data: { ...data, ...(changesRouting ? { overflowForwardConfirmedAt: null, overflowProvedAt: null } : {}) },
  });
  return NextResponse.json(await view(auth.business.id));
}
