import { personActor, recordAudit } from "@/lib/audit";
import { forgetCallReviews } from "@/lib/call-review";
import { normalizePhone } from "@/lib/customer";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { RECORDING_SID, deleteTwilioRecording } from "@/lib/retention";
import { deleteVapiCall } from "@/lib/vapi";

export const FORGOTTEN = "Deleted at the customer's request";

type RemoteDelete = (id: string) => Promise<"deleted" | "missing">;

/**
 * Deleting here and deleting at the providers are separate facts. "scrubbed"
 * is our database; provider copies (Vapi call records, Twilio recordings) are
 * "confirmed" only once each delete call succeeded, else "pending" until the
 * retention sweep finishes them and records provider_deletion_confirmed.
 */
export type ForgetState = { local: "scrubbed"; provider: "confirmed" | "pending" | "not_needed" };

export type ForgetResult =
  | ({ ok: true; calls: number; requests: number; jobs: number; texts: number; remotePending: number } & ForgetState)
  | { ok: false; reason: "not_found" | "active_plan" };

const VOICEMAIL_LINES = /^Voicemail \(\d+s\): \S*\/Recordings\/RE[0-9a-f]{32}\S*$/gim;

/** Every row that is about this customer: matched by link, by phone, or through the call a request came from. */
export async function findCustomerFootprint(businessId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, businessId },
    select: { id: true, phone: true, phoneNormalized: true },
  });
  if (!customer) return null;
  const phoneNormalized = normalizePhone(customer.phone) ?? customer.phoneNormalized;
  const phones = [...new Set([customer.phone, customer.phoneNormalized, phoneNormalized].filter(Boolean))];

  const leads = await prisma.lead.findMany({
    where: { businessId, OR: [{ customerId: customer.id }, { phone: { in: phones } }] },
    select: { id: true, notes: true, callId: true },
  });
  const leadIds = leads.map((l) => l.id);
  const calls = await prisma.call.findMany({
    where: {
      businessId,
      OR: [
        { customerId: customer.id },
        { callerPhone: { in: phones } },
        { id: { in: leads.flatMap((l) => (l.callId ? [l.callId] : [])) } },
      ],
    },
    select: { id: true, vapiCallId: true },
  });
  const jobs = await prisma.job.findMany({
    where: { businessId, OR: [{ customerId: customer.id }, { leadId: { in: leadIds } }] },
    select: { id: true },
  });
  return {
    customer,
    phoneNormalized,
    leads,
    calls,
    jobs,
    leadIds,
    callIds: calls.map((c) => c.id),
    jobIds: jobs.map((j) => j.id),
  };
}

/*
  A customer asking a shop to delete what it holds about them. What identifies
  or records the person goes: name, number, email, address, notes, call
  transcripts and recordings (ours and the copies at Vapi and Twilio), texts,
  photos and signatures. The shop keeps that a call came in and a job was done,
  without who, because invoices and its own counts depend on those rows. The
  STOP record stays on purpose: forgetting it would let the shop text a person
  who told it not to.
*/
export async function forgetCustomer(
  params: { businessId: string; customerId: string; actorEmail: string; role: string },
  deps: { deleteVapi?: RemoteDelete | null; deleteTwilio?: RemoteDelete | null; now?: Date } = {},
): Promise<ForgetResult> {
  const now = deps.now ?? new Date();
  const deleteVapi = deps.deleteVapi !== undefined ? deps.deleteVapi : process.env.VAPI_API_KEY ? deleteVapiCall : null;
  const deleteTwilio =
    deps.deleteTwilio !== undefined
      ? deps.deleteTwilio
      : process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
        ? deleteTwilioRecording
        : null;

  const footprint = await findCustomerFootprint(params.businessId, params.customerId);
  if (!footprint) return { ok: false, reason: "not_found" };
  const { customer, phoneNormalized, leads, calls, jobs, leadIds, callIds, jobIds } = footprint;

  const plan = await prisma.planMember.findFirst({
    where: { businessId: params.businessId, phoneNormalized, status: { in: ["active", "past_due"] } },
    select: { id: true },
  });
  if (plan) return { ok: false, reason: "active_plan" };

  const goneRemote = new Set<string>();
  for (const call of calls) {
    if (!call.vapiCallId) {
      goneRemote.add(call.id);
      continue;
    }
    if (!deleteVapi) continue;
    try {
      await deleteVapi(call.vapiCallId);
      goneRemote.add(call.id);
    } catch (error) {
      logWarn("forget.vapi_delete_failed", { callId: call.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  /* A voicemail whose recording can't be deleted yet keeps only its recording line, so the retention sweep can finish it. */
  const leadNotes = new Map<string, string>();
  for (const lead of leads) {
    const lines = (lead.notes ?? "").match(VOICEMAIL_LINES) ?? [];
    let pending = lines;
    if (lines.length && deleteTwilio) {
      try {
        for (const line of lines) for (const m of line.matchAll(RECORDING_SID)) await deleteTwilio(m[1]!);
        pending = [];
      } catch (error) {
        logWarn("forget.twilio_delete_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
      }
    }
    leadNotes.set(lead.id, pending.length ? pending.join("\n") : FORGOTTEN);
  }
  const remotePending = calls.length - goneRemote.size + [...leadNotes.values()].filter((n) => n !== FORGOTTEN).length;

  await forgetCallReviews(callIds);
  const texts = await prisma.$transaction(async (tx) => {
    const scrubCall = { transcript: null, recordingUrl: null, summary: FORGOTTEN, callerPhone: null, customerId: null, forgetRequestedAt: now };
    const gone = [...goneRemote];
    const pending = callIds.filter((id) => !goneRemote.has(id));
    if (gone.length) await tx.call.updateMany({ where: { id: { in: gone } }, data: { ...scrubCall, contentPurgedAt: now } });
    if (pending.length) await tx.call.updateMany({ where: { id: { in: pending } }, data: scrubCall });

    for (const lead of leads) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { name: null, phone: null, email: null, address: null, notes: leadNotes.get(lead.id), customerId: null, forgetRequestedAt: now },
      });
    }
    if (jobIds.length) {
      await tx.job.updateMany({ where: { id: { in: jobIds } }, data: { address: null, notes: null, customerId: null } });
      await tx.jobPhoto.deleteMany({ where: { jobId: { in: jobIds } } });
      await tx.jobSignature.deleteMany({ where: { jobId: { in: jobIds } } });
    }

    const removed = await tx.message.deleteMany({ where: { businessId: params.businessId, phoneNormalized } });
    await tx.outboundSms.deleteMany({ where: { businessId: params.businessId, toNormalized: phoneNormalized } });
    await tx.takeover.deleteMany({ where: { businessId: params.businessId, phoneNormalized } });
    await tx.planMember.deleteMany({ where: { businessId: params.businessId, phoneNormalized } });
    await tx.auditEvent.updateMany({
      where: {
        businessId: params.businessId,
        OR: [{ customerId: customer.id }, { leadId: { in: leadIds } }, { callId: { in: callIds } }, { jobId: { in: jobIds } }],
      },
      data: { summary: FORGOTTEN, detailJson: null, customerId: null },
    });
    await tx.customer.delete({ where: { id: customer.id } });
    return removed.count;
  });

  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "customer.forgotten",
    ...personActor({ role: params.role, email: params.actorEmail }),
    summary: remotePending
      ? `${params.actorEmail} deleted a customer's personal data at their request; ${remotePending} provider ${remotePending === 1 ? "copy is" : "copies are"} still being deleted`
      : `${params.actorEmail} deleted a customer's personal data at their request`,
    detail: { calls: calls.length, requests: leads.length, jobs: jobs.length, texts, remotePending, provider: remotePending ? "pending" : "confirmed" },
  });

  const remoteCopies = calls.filter((c) => c.vapiCallId).length + leads.filter((l) => (l.notes ?? "").match(VOICEMAIL_LINES)).length;
  const provider = remotePending ? "pending" : remoteCopies ? "confirmed" : "not_needed";
  return { ok: true, calls: calls.length, requests: leads.length, jobs: jobs.length, texts, remotePending, local: "scrubbed", provider };
}
