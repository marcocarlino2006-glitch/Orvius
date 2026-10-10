import { recordAudit, type AuditActor } from "@/lib/audit";
import { findOption, parseEstimateOptions, type EstimateOption } from "@/lib/estimate-options";
import { formatCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { pricedInvoice } from "@/lib/invoice-tax";

export type ChooseResult =
  | { ok: true; option: EstimateOption | null }
  | { ok: false; status: number; error: string };

/**
 * Accepting an estimate with options means accepting one of them. The chosen
 * price becomes the estimate amount and the invoice amount, so card checkout,
 * "I paid" and the books all charge what the customer picked. Once money is
 * recorded against the invoice the choice is locked.
 */
export async function acceptEstimate(params: {
  estimateId: string;
  optionKey?: string | null;
  by: "customer" | "shop";
  actor: AuditActor;
  actorEmail?: string | null;
}): Promise<ChooseResult> {
  const estimate = await prisma.estimate.findUnique({
    where: { id: params.estimateId },
    include: { invoice: { include: { payments: { select: { id: true } } } } },
  });
  if (!estimate) return { ok: false, status: 404, error: "Estimate not found" };

  const options = parseEstimateOptions(estimate.optionsJson);
  const option = options.length ? findOption(options, params.optionKey) : null;
  if (options.length && !option) {
    return { ok: false, status: 400, error: "Pick one of the options first." };
  }
  if (option && estimate.chosenOption && estimate.chosenOption !== option.key) {
    const locked = estimate.invoice && (estimate.invoice.status === "paid" || estimate.invoice.payments.length > 0);
    if (locked) {
      return { ok: false, status: 409, error: "This estimate is already paid. Ask the shop to change the option." };
    }
  }

  const amountCents = option?.amountCents ?? estimate.amountCents;
  const priced = await pricedInvoice(estimate.businessId, amountCents);
  await prisma.$transaction(async (tx) => {
    await tx.estimate.update({
      where: { id: estimate.id },
      data: {
        status: "accepted",
        acceptedAt: estimate.acceptedAt ?? new Date(),
        ...(option ? { chosenOption: option.key, amountCents } : {}),
      },
    });
    if (!estimate.invoice) {
      await tx.invoice.create({
        data: {
          businessId: estimate.businessId,
          estimateId: estimate.id,
          jobId: estimate.jobId,
          ...priced,
          status: "open",
        },
      });
    } else if (option && estimate.invoice.status !== "paid" && !estimate.invoice.payments.length) {
      await tx.invoice.update({ where: { id: estimate.invoice.id }, data: priced });
    }
  });

  if (estimate.jobId && (option?.key !== estimate.chosenOption || estimate.status !== "accepted")) {
    const who = params.by === "customer" ? "The customer" : "The shop";
    await recordAudit({
      businessId: estimate.businessId,
      entityType: "job",
      entityId: estimate.jobId,
      jobId: estimate.jobId,
      action: "estimate.accepted",
      actor: params.actor,
      actorEmail: params.actorEmail ?? null,
      summary: option
        ? `${who} chose ${option.label} · ${formatCents(option.amountCents)}.`
        : `${who} accepted the estimate · ${formatCents(amountCents)}.`,
      detail: { by: params.by, amountCents, ...(option ? { option: option.key } : {}) },
    });
  }
  return { ok: true, option };
}
