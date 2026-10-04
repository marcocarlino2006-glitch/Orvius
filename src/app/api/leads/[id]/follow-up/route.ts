import { NextResponse } from "next/server";
import { personActor } from "@/lib/audit";
import { previewFollowUp, sendLeadFollowUp } from "@/lib/lead-follow-up";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/** The text Orvius would send, and whether it can go now. */
export async function GET(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const preview = await previewFollowUp(authResult.business.id, id);
  if (!preview) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  return NextResponse.json(preview);
}

export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  const actor = personActor(authResult);
  const result = await sendLeadFollowUp({
    businessId: authResult.business.id,
    leadId: id,
    by: { actor: actor.actor === "owner" ? "owner" : "teammate", actorEmail: actor.actorEmail },
  });
  if (!result.sent) return NextResponse.json({ error: result.reason }, { status: 409 });
  return NextResponse.json({ ok: true });
}
