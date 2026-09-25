import { recordAudit } from "@/lib/audit";
import { detectCallIntent, type CallIntent } from "@/lib/call-intent";
import { createJobFromLead } from "@/lib/job";
import { classifyRequest, normalizeUrgency, type RequestClassification } from "@/lib/trade-playbooks";
import { callerWords } from "@/lib/transcript";
import { getEffectivePlanId } from "@/lib/plan-features";
import { prisma } from "@/lib/prisma";
import { isInServiceArea } from "@/lib/service-area";

/** Sort / capture priority — emergency and same-day surface first. */
export function isPriorityUrgency(urgency?: string | null): boolean {
  const key = urgency?.toLowerCase().replace(/\s+/g, "-") ?? "";
  return (
    key.includes("emergency") ||
    key.includes("same-day") ||
    key.includes("same_day") ||
    key === "today"
  );
}

/** @deprecated Use isPriorityUrgency — kept for imports during transition. */
export const isAutoBookUrgency = isPriorityUrgency;

/**
 * SMS has no voice-agent extraction pass. Infer urgency only from explicit
 * language; silence stays null instead of the system pretending to know.
 */
export function inferExplicitUrgency(
  text: string | null | undefined,
): "emergency" | "same-day" | "this-week" | "flexible" | null {
  const value = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!value) return null;
  if (
    /\b(emergency|gas leak|smell gas|sparking|electrical fire|burst pipe|flooding|water everywhere)\b/.test(
      value,
    )
  ) {
    return "emergency";
  }
  if (/\b(asap|urgent|today|same[ -]?day|no heat|no cooling)\b/.test(value)) {
    return "same-day";
  }
  if (/\b(this week|next few days)\b/.test(value)) return "this-week";
  if (/\b(no rush|whenever|flexible)\b/.test(value)) return "flexible";
  return null;
}

export type AutoBookSkipReason =
  | "already_booked"
  | "missing_business"
  | "unqualified"
  | "non_service"
  | "capacity_unavailable"
  | "plan_blocked"
  | "out_of_area"
  | "safety_escalation"
  | "missing_address"
  | "existing_job"
  | "follow_up"
  | "complaint"
  | "not_found";

export type ExistingJobRef = { id: string; title: string | null; scheduledAt: Date | null };

export type AutoBookResult = {
  jobId: string | null;
  created: boolean;
  qualified: boolean;
  skipReason?: AutoBookSkipReason;
  classification?: RequestClassification;
  intent?: CallIntent;
  /** Open work this call was about, when it was not a new request. */
  existingJob?: ExistingJobRef;
};

const OPEN_JOB_STATUSES = ["scheduled", "confirmed", "en_route", "on_site"];
const REPEAT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function hasUsablePhone(phone?: string | null): boolean {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10;
}

/**
 * Capture qualify gate — phone + (service or address).
 * Stops SMS junk and hang-up stubs from becoming fake jobs.
 */
export function isLeadQualifiedForBooking(lead: {
  phone?: string | null;
  serviceType?: string | null;
  address?: string | null;
  name?: string | null;
  categoryCode?: string | null;
}): boolean {
  if (lead.categoryCode === "other.non_service") return false;
  if (!hasUsablePhone(lead.phone)) return false;
  const service = lead.serviceType?.trim() ?? "";
  const address = lead.address?.trim() ?? "";
  if (lead.categoryCode && lead.categoryCode !== "other.non_service") {
    return true;
  }
  // Unknown words without a service location are a callback request, not an
  // appointment. A recognised category may be proposed before the address is
  // known; otherwise require an address and keep the lead open to qualify.
  if (!address) return false;
  if (service.length < 2 && address.length < 4) return false;
  return true;
}

/**
 * Loop 1 capture book:
 * - Qualify first (phone + service/address)
 * - Optional service-ZIP allowlist can reject out-of-area
 * - Every entitled shop (Line / Pro / Fleet / pilot) auto-books qualified leads
 * - Expired / locked billing → plan_blocked
 */
export async function maybeAutoBookLead(leadId: string): Promise<AutoBookResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      job: { select: { id: true } },
      business: {
        select: {
          billingStatus: true,
          billingPlan: true,
          pilotEndsAt: true,
          createdAt: true,
          serviceZipsJson: true,
          trade: true,
          servicesJson: true,
          name: true,
        },
      },
    },
  });

  if (!lead) {
    return { jobId: null, created: false, qualified: false, skipReason: "not_found" };
  }

  if (lead.job) {
    return {
      jobId: lead.job.id,
      created: false,
      qualified: true,
      skipReason: "already_booked",
    };
  }

  if (!lead.businessId || !lead.business) {
    return {
      jobId: null,
      created: false,
      qualified: false,
      skipReason: "missing_business",
    };
  }

  const businessId = lead.businessId;
  const call = lead.callId
    ? await prisma.call.findUnique({
        where: { id: lead.callId },
        select: { transcript: true, heldSlotAt: true },
      })
    : null;
  const spoken = callerWords(call?.transcript);
  const classification = classifyRequest({
    business: lead.business,
    serviceType: lead.serviceType,
    notes: lead.notes,
    callerWords: spoken,
    urgency: lead.urgency,
  });
  const intent = detectCallIntent(lead.serviceType, lead.notes, spoken);
  const link = {
    businessId,
    callId: lead.callId,
    leadId: lead.id,
    customerId: lead.customerId,
    entityType: "lead" as const,
    entityId: lead.id,
  };
  const decide = (action: string, summary: string, detail?: Record<string, unknown>) =>
    recordAudit({ ...link, action, summary, detail, idempotencyKey: `lead:${lead.id}:${action}` });

  await decide(
    "playbook.classified",
    `${classification.trade ?? "General"} playbook: ${classification.service.label} · ${classification.service.durationMin} min${
      classification.urgency ? ` · ${classification.urgency}` : ""
    }`,
    { ...classification },
  );

  /*
    The playbook's read of urgency is what Command sorts by and what the owner's
    text leads with. Leaving the extractor's raw label ("ASAP!!", or nothing at
    all for "elderly caller, house freezing") buried emergencies in the queue.
  */
  const urgency = classification.urgency ?? normalizeUrgency(lead.urgency);
  if (urgency && lead.urgency !== urgency) {
    await prisma.lead.update({ where: { id: lead.id }, data: { urgency } });
  }

  if (classification.safety) {
    await decide(
      "lead.escalated",
      `Escalated to a human — ${classification.safety.label}. ${classification.safety.instruction}`,
      { safety: classification.safety },
    );
    return {
      jobId: null,
      created: false,
      qualified: true,
      skipReason: "safety_escalation",
      classification,
      intent,
    };
  }

  const phone = lead.phone?.trim();
  const openJobs =
    lead.customerId || phone
      ? await prisma.job.findMany({
          where: {
            businessId,
            status: { in: OPEN_JOB_STATUSES },
            OR: [
              ...(lead.customerId ? [{ customerId: lead.customerId }] : []),
              ...(phone ? [{ lead: { phone } }] : []),
            ],
          },
          orderBy: { scheduledAt: "asc" },
          select: { id: true, title: true, scheduledAt: true, categoryCode: true, createdAt: true },
          take: 5,
        })
      : [];

  if (intent === "complaint") {
    await decide(
      "lead.follow_up",
      "Caller is unhappy about a past visit or a bill — held for the owner to call, not booked as new work",
      { intent },
    );
    return { jobId: null, created: false, qualified: true, skipReason: "complaint", classification, intent };
  }

  if (intent !== "new") {
    const target = openJobs[0];
    if (target) {
      await decide(
        "lead.follow_up",
        `About existing job — caller wants to ${intent === "status" ? "check on" : intent} ${target.title ?? "their appointment"}. No new job created.`,
        { intent, jobId: target.id },
      );
      return {
        jobId: null,
        created: false,
        qualified: true,
        skipReason: "existing_job",
        classification,
        intent,
        existingJob: { id: target.id, title: target.title, scheduledAt: target.scheduledAt },
      };
    }
    await decide(
      "lead.follow_up",
      `Caller asked about an appointment (${intent}), but no open job matches — held for the owner`,
      { intent },
    );
    return { jobId: null, created: false, qualified: true, skipReason: "follow_up", classification, intent };
  }

  const repeat = openJobs.find(
    (job) =>
      Date.now() - job.createdAt.getTime() < REPEAT_WINDOW_MS &&
      (!lead.categoryCode || !job.categoryCode || job.categoryCode === lead.categoryCode),
  );
  if (repeat) {
    await decide(
      "lead.follow_up",
      `Called again about ${repeat.title ?? "a job already booked"} — no duplicate job created`,
      { jobId: repeat.id },
    );
    return {
      jobId: null,
      created: false,
      qualified: true,
      skipReason: "existing_job",
      classification,
      intent,
      existingJob: { id: repeat.id, title: repeat.title, scheduledAt: repeat.scheduledAt },
    };
  }

  const qualified = isLeadQualifiedForBooking(lead);
  if (!qualified) {
    const missing = [
      !hasUsablePhone(lead.phone) ? "callback number" : null,
      !lead.address?.trim() ? "address" : null,
      !lead.serviceType?.trim() ? "service" : null,
    ].filter(Boolean);
    await decide(
      "lead.held",
      lead.categoryCode === "other.non_service"
        ? "Held — not a service request"
        : `Held for the owner — missing ${missing.join(", ") || "details to book"}`,
      { missing },
    );
    return {
      jobId: null,
      created: false,
      qualified: false,
      skipReason:
        lead.categoryCode === "other.non_service"
          ? "non_service"
          : "unqualified",
      classification,
    };
  }

  const plan = getEffectivePlanId(lead.business);
  // Life-changing wedge: Line books every qualified lead. Jobs module still
  // gates Dispatch UI — not the front-door book.
  if (plan === "expired") {
    await decide("lead.held", "Held — the shop's plan has ended, so Orvius did not book");
    return {
      jobId: null,
      created: false,
      qualified: true,
      skipReason: "plan_blocked",
    };
  }

  // A recognised request is real demand without an address, but a technician
  // cannot be sent to one and the service area cannot be checked.
  if (!lead.address?.trim()) {
    await decide("lead.held", "Held for the owner — missing address, so Orvius did not send a technician", {
      missing: ["address"],
    });
    return {
      jobId: null,
      created: false,
      qualified: true,
      skipReason: "missing_address",
      classification,
    };
  }

  const inArea = isInServiceArea(lead.address, lead.business.serviceZipsJson);
  if (inArea === false) {
    await decide("service_area.checked", "Outside the service area — held for the owner to decide", { inArea });
    return {
      jobId: null,
      created: false,
      qualified: false,
      skipReason: "out_of_area",
      classification,
    };
  }
  await decide(
    "service_area.checked",
    inArea === true ? "Address is inside the service area" : "No service area set — accepted",
    { inArea },
  );

  const held = call?.heldSlotAt && call.heldSlotAt.getTime() > Date.now() ? call.heldSlotAt : null;
  let job;
  try {
    job = await createJobFromLead({
      leadId,
      scheduledAt: held,
      notes: held ? "Booked on the call — the caller picked this time" : "Auto-booked from inbound lead",
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("No appointment capacity")
    ) {
      await decide("lead.held", "No open slot in the next 14 days — held for the owner to schedule");
      return {
        jobId: null,
        created: false,
        qualified: true,
        skipReason: "capacity_unavailable",
        classification,
      };
    }
    throw error;
  }

  return { jobId: job.id, created: true, qualified: true, classification };
}
