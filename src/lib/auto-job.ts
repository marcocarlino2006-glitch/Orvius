import { recordAudit } from "@/lib/audit";
import { createJobFromLead } from "@/lib/job";
import { classifyRequest, type RequestClassification } from "@/lib/trade-playbooks";
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
  | "not_found";

export type AutoBookResult = {
  jobId: string | null;
  created: boolean;
  qualified: boolean;
  skipReason?: AutoBookSkipReason;
  classification?: RequestClassification;
};

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
  const classification = classifyRequest({
    business: lead.business,
    serviceType: lead.serviceType,
    notes: lead.notes,
    urgency: lead.urgency,
  });
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

  if (classification.safety) {
    if (classification.urgency && lead.urgency !== classification.urgency) {
      await prisma.lead.update({ where: { id: lead.id }, data: { urgency: classification.urgency } });
    }
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

  let job;
  try {
    job = await createJobFromLead({
      leadId,
      notes: "Auto-booked from inbound lead",
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
