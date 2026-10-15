import { NextResponse } from "next/server";
import { personActor, recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { SCHEDULING_POLICY_VERSION, getSchedulingPolicy, parsePolicyInput } from "@/lib/scheduling-policy";
import { requirePermission } from "@/lib/tenant";

/*
  How travel works between one technician's jobs is the owner's call: no gap
  (duration only, no drive-time claim) or a fixed minimum. A shop that has not
  chosen yet holds bookings for the owner; a shop from before this policy keeps
  booking exactly as it did until the owner chooses.
*/

export async function GET() {
  const auth = await requirePermission("settings.edit", { entitled: false });
  if ("error" in auth) return auth.error;
  const policy = await getSchedulingPolicy(auth.business.id);
  return NextResponse.json({ rulesVersion: SCHEDULING_POLICY_VERSION, policy, canEdit: auth.role === "owner" });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("settings.edit");
  if ("error" in auth) return auth.error;
  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Only the owner sets how travel time works between jobs." }, { status: 403 });
  }
  const input = parsePolicyInput(await request.json().catch(() => null));
  if ("error" in input) return NextResponse.json({ error: input.error }, { status: 422 });

  const before = await getSchedulingPolicy(auth.business.id);
  const row = await prisma.shopOperatingPolicy.upsert({
    where: { businessId: auth.business.id },
    create: {
      businessId: auth.business.id,
      travelMode: input.travelMode,
      travelGapMin: input.travelGapMin,
      updatedByEmail: auth.email,
      updatedByRole: auth.role,
    },
    update: {
      travelMode: input.travelMode,
      travelGapMin: input.travelGapMin,
      version: { increment: 1 },
      updatedByEmail: auth.email,
      updatedByRole: auth.role,
    },
  });
  const after = await getSchedulingPolicy(auth.business.id);
  await recordAudit({
    businessId: auth.business.id,
    entityType: "shop",
    entityId: auth.business.id,
    ...personActor(auth),
    action: "scheduling_policy.updated",
    summary:
      after.state === "min_gap"
        ? `Set at least ${after.gapMin} min between one technician's jobs.`
        : "Set scheduling to job length only, with no travel gap.",
    detail: {
      rulesVersion: SCHEDULING_POLICY_VERSION,
      before: { state: before.state, gapMin: before.gapMin, version: before.version },
      after: { state: after.state, gapMin: after.gapMin, version: row.version },
    },
    idempotencyKey: `scheduling-policy:${auth.business.id}:${row.version}`,
  });
  return NextResponse.json({ rulesVersion: SCHEDULING_POLICY_VERSION, policy: after });
}
