import { recordAudit } from "@/lib/audit";
import { customerConfirmUrl, ensureCustomerConfirmToken, firstName } from "@/lib/customer-confirm";
import { sendCustomerSms } from "@/lib/customer-sms";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

/** Matches the "on the way" sample registered with carriers for every shop's texting campaign. */
export function onTheWayText(params: { shop: string; tech: string | null; eta: string | null; url: string }): string {
  const who = params.tech ?? "Your technician";
  const eta = params.eta?.trim();
  return withSmsOptOutFooter(
    [
      `${params.shop}: ${who} is on the way${eta ? ` and should arrive in about ${eta}` : ""}.`,
      `Follow along: ${params.url}`,
    ].join("\n"),
  );
}

/**
 * Tell the customer their tech has left, with a link to the live status page.
 * Callers send this only from the transition into en_route, so it goes once per trip.
 */
export async function notifyCustomerOnTheWay(jobId: string): Promise<{ sent: boolean; reason?: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      leadId: true,
      customerId: true,
      etaText: true,
      business: { select: { name: true } },
      technician: { select: { name: true } },
      customer: { select: { phone: true, name: true } },
      lead: { select: { phone: true, name: true } },
    },
  });
  if (!job) return { sent: false, reason: "not_found" };
  const to = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  if (!to) return { sent: false, reason: "no_customer_phone" };

  const token = await ensureCustomerConfirmToken(job.id);
  const tech = firstName(job.technician?.name);
  const body = onTheWayText({ shop: job.business.name, tech, eta: job.etaText, url: customerConfirmUrl(token) });

  try {
    const result = await sendCustomerSms({ businessId: job.businessId, to, body });
    if (!result.sent) return result;
    logInfo("customer.on_the_way_sent", { jobId: job.id, businessId: job.businessId, sid: result.sid });
    await recordAudit({
      businessId: job.businessId,
      entityType: "job",
      entityId: job.id,
      action: "customer.on_the_way_sent",
      actor: "orvius",
      summary: `Texted ${job.customer?.name ?? job.lead?.name ?? "the customer"} that ${tech ?? "the technician"} is on the way`,
      jobId: job.id,
      leadId: job.leadId,
      customerId: job.customerId,
    });
    return { sent: true };
  } catch (error) {
    logWarn("customer.on_the_way_failed", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "send failed",
    });
    return { sent: false, reason: error instanceof Error ? error.message : "send_failed" };
  }
}
