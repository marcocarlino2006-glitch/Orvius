import { createJobFromLead } from "@/lib/job";
import { canAccessModule, getEffectivePlanId } from "@/lib/plan-features";
import { prisma } from "@/lib/prisma";

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

export type AutoBookSkipReason =
  | "already_booked"
  | "missing_business"
  | "unqualified"
  | "plan_blocked"
  | "not_found";

export type AutoBookResult = {
  jobId: string | null;
  created: boolean;
  qualified: boolean;
  skipReason?: AutoBookSkipReason;
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
}): boolean {
  if (!hasUsablePhone(lead.phone)) return false;
  const service = lead.serviceType?.trim() ?? "";
  const address = lead.address?.trim() ?? "";
  if (service.length < 2 && address.length < 4) return false;
  // Refuse generic SMS placeholders as "service"
  if (
    !address &&
    /^(sms inquiry|sms|text|unknown|n\/?a)$/i.test(service)
  ) {
    return false;
  }
  return true;
}

/**
 * Loop 1 capture book:
 * - Qualify first (phone + service/address)
 * - Pro/pilot/fleet: auto-book qualified leads
 * - Line: auto-book ONLY priority urgency (emergency/same-day) so the
 *   front door still closes the loop without full Jobs module upsell theater
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

  const qualified = isLeadQualifiedForBooking(lead);
  if (!qualified) {
    return {
      jobId: null,
      created: false,
      qualified: false,
      skipReason: "unqualified",
    };
  }

  const plan = getEffectivePlanId(lead.business);
  const hasJobs = canAccessModule(plan, "jobs");
  const priority = isPriorityUrgency(lead.urgency);

  // Line closes capture for emergencies only; Pro+ books all qualified.
  if (!hasJobs && !priority) {
    return {
      jobId: null,
      created: false,
      qualified: true,
      skipReason: "plan_blocked",
    };
  }

  const job = await createJobFromLead({
    leadId,
    notes: hasJobs
      ? "Auto-booked from inbound lead"
      : "Auto-booked priority capture (Line)",
  });

  return { jobId: job.id, created: true, qualified: true };
}
