import { NextResponse } from "next/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireEntitledSession } from "@/lib/tenant";
import { assignWork, listWork, workAssignees } from "@/lib/work";

export async function GET(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;
  const view = new URL(request.url).searchParams.get("view") === "closed" ? "closed" : "open";
  const [work, assignees] = await Promise.all([listWork(business.id, view), workAssignees(business)]);
  return NextResponse.json({ view, ...work, assignees });
}

const assignSchema = z.object({
  kind: z.enum(["request", "job"]),
  id: z.string().min(1).max(64),
  email: z.string().email().max(254).nullable(),
});

/** Make a teammate responsible for a request or a job; null hands it back to the owner. */
export async function PATCH(request: Request) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business, email: actorEmail, role } = authResult;
  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick who is responsible." }, { status: 400 });

  const result = await assignWork({ business, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await recordAudit({
    businessId: business.id,
    entityType: parsed.data.kind === "request" ? "lead" : "job",
    entityId: parsed.data.id,
    action: "work.assigned",
    actor: role === "owner" ? "owner" : "teammate",
    actorEmail,
    summary: parsed.data.email ? `${actorEmail} made ${parsed.data.email} responsible` : `${actorEmail} handed it back to the owner`,
  });
  return NextResponse.json({ ok: true });
}
