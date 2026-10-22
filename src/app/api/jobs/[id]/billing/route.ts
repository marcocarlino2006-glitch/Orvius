import { NextResponse } from "next/server";

import { personActor } from "@/lib/audit";
import { retryJobBilling } from "@/lib/job-billing";
import { requirePlanModule } from "@/lib/plan-gate";
import { requireEntitledSession } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

/**
 * Open the bill for a completed job. Shop-scoped. Does not text the customer,
 * charge a card, or change a bill that was already sent. Repeating it is safe.
 */
export async function POST(_request: Request, { params }: Params) {
  const authResult = await requireEntitledSession();
  if ("error" in authResult) return authResult.error;
  const { business } = authResult;

  const planGate = requirePlanModule(business, "jobs");
  if ("error" in planGate) return planGate.error;

  const { id } = await params;
  const actor = personActor(authResult);
  const result = await retryJobBilling({ businessId: business.id, jobId: id, actor: actor.actor, actorEmail: actor.actorEmail });
  if (!result.found) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const settled = result.settled;
  if (settled.outcome === "succeeded") {
    return NextResponse.json({ ok: true, outcome: settled.outcome, invoiceId: settled.invoiceId, amountCents: settled.amountCents, sent: false });
  }
  if (settled.outcome === "not_required") {
    return NextResponse.json({ ok: true, outcome: settled.outcome, amountCents: settled.amountCents, sent: false });
  }
  const error =
    settled.outcome === "failed"
      ? settled.error
      : settled.outcome === "pending"
        ? "The bill is already being opened. Give it a minute, then look again."
        : "The job isn't done, so there's nothing to bill yet.";
  return NextResponse.json({ ok: false, outcome: settled.outcome, error }, { status: 409 });
}
