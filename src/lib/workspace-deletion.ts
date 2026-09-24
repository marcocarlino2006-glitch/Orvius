import { logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type DeletionCheck =
  | { ok: true }
  | { ok: false; status: number; error: string; reason: "not_owner" | "confirm_mismatch" | "active_subscription" };

/** Only the owner, naming the workspace exactly, with no live subscription still billing them. */
export function checkWorkspaceDeletion(params: {
  business: { name: string; ownerEmail: string | null; billingStatus: string; stripeSubscriptionId: string | null };
  requesterEmail: string;
  confirm: string;
}): DeletionCheck {
  if (params.business.ownerEmail?.toLowerCase() !== params.requesterEmail.toLowerCase()) {
    return { ok: false, status: 403, error: "Only the workspace owner can delete it.", reason: "not_owner" };
  }
  if (params.confirm.trim().toLowerCase() !== params.business.name.trim().toLowerCase()) {
    return {
      ok: false,
      status: 400,
      error: `Type the workspace name “${params.business.name}” to confirm.`,
      reason: "confirm_mismatch",
    };
  }
  const billing = params.business.billingStatus.toLowerCase();
  if (params.business.stripeSubscriptionId && (billing === "active" || billing === "past_due")) {
    return {
      ok: false,
      status: 409,
      error: "Cancel your plan on Billing first so you are not charged again, then delete.",
      reason: "active_subscription",
    };
  }
  return { ok: true };
}

/**
 * Remove every record the workspace owns. Most tables cascade from Business;
 * leads and webhook events only null their businessId, so they go first.
 */
export async function deleteWorkspace(businessId: string, ownerEmail: string | null) {
  const counts = await prisma.$transaction(async (tx) => {
    const leads = await tx.lead.deleteMany({ where: { businessId } });
    const webhooks = await tx.webhookEvent.deleteMany({ where: { businessId } });
    const tokens = ownerEmail ? await tx.loginToken.deleteMany({ where: { email: ownerEmail.toLowerCase() } }) : { count: 0 };
    await tx.business.delete({ where: { id: businessId } });
    return { leads: leads.count, webhooks: webhooks.count, loginTokens: tokens.count };
  });
  logInfo("workspace.deleted", { businessId, ...counts });
  return counts;
}
