import { prisma } from "@/lib/prisma";

export type CustomerTouch = {
  businessId: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};

/** Normalize US phone to E.164-ish digits for dedup (keeps leading + if present). */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;

  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.startsWith("+") && digits.length >= 10) return `+${digits}`;

  return digits.length >= 7 ? digits : null;
}

export function displayPhone(normalized: string): string {
  const digits = normalized.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return normalized;
}

export function customerDisplayName(
  name: string | null | undefined,
  phone: string,
): string {
  if (name?.trim()) return name.trim();
  return displayPhone(phone);
}

/**
 * Ring 2 — find or create a customer record for every inbound touch.
 * Merges by normalized phone per business.
 */
export async function findOrCreateCustomer(touch: CustomerTouch) {
  const normalized = normalizePhone(touch.phone);
  if (!normalized) {
    return null;
  }

  const existing = await prisma.customer.findUnique({
    where: {
      businessId_phoneNormalized: {
        businessId: touch.businessId,
        phoneNormalized: normalized,
      },
    },
  });

  if (existing) {
    const mergedName = touch.name?.trim() || existing.name;
    const mergedEmail = touch.email?.trim() || existing.email;
    const mergedAddress = touch.address?.trim() || existing.address;
    const mergedNotes = touch.notes?.trim()
      ? existing.notes
        ? `${existing.notes}\n${touch.notes.trim()}`
        : touch.notes.trim()
      : existing.notes;

    return prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: mergedName,
        email: mergedEmail,
        address: mergedAddress,
        notes: mergedNotes,
        phone: touch.phone?.trim() || existing.phone,
        interactionCount: { increment: 1 },
        lastSeenAt: new Date(),
      },
    });
  }

  return prisma.customer.create({
    data: {
      businessId: touch.businessId,
      phone: touch.phone?.trim() || normalized,
      phoneNormalized: normalized,
      name: touch.name?.trim() || null,
      email: touch.email?.trim() || null,
      address: touch.address?.trim() || null,
      notes: touch.notes?.trim() || null,
    },
  });
}

export async function attachCustomerToCall(callId: string, customerId: string) {
  return prisma.call.update({
    where: { id: callId },
    data: { customerId },
  });
}

export async function attachCustomerToLead(leadId: string, customerId: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: { customerId },
  });
}

export async function linkTouchToCustomer(params: {
  businessId: string;
  callId?: string;
  leadId?: string;
  phone?: string | null;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const customer = await findOrCreateCustomer({
    businessId: params.businessId,
    phone: params.phone,
    name: params.name,
    email: params.email,
    address: params.address,
    notes: params.notes,
  });

  if (!customer) return null;

  if (params.callId) {
    await attachCustomerToCall(params.callId, customer.id);
  }
  if (params.leadId) {
    await attachCustomerToLead(params.leadId, customer.id);
  }

  return customer;
}

export type TimelineEvent = {
  id: string;
  type: "call" | "lead";
  at: string;
  title: string;
  summary: string | null;
  source: string | null;
  urgency: string | null;
  status: string | null;
};

export async function getCustomerTimeline(customerId: string): Promise<TimelineEvent[]> {
  const [calls, leads] = await Promise.all([
    prisma.call.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const events: TimelineEvent[] = [
    ...calls.map((call) => ({
      id: call.id,
      type: "call" as const,
      at: call.createdAt.toISOString(),
      title: call.status === "completed" ? "Inbound call" : "Call in progress",
      summary: call.summary,
      source: "call",
      urgency: null,
      status: call.status,
    })),
    ...leads.map((lead) => ({
      id: lead.id,
      type: "lead" as const,
      at: lead.createdAt.toISOString(),
      title: lead.serviceType ?? "Lead captured",
      summary: lead.notes,
      source: lead.source,
      urgency: lead.urgency,
      status: lead.status,
    })),
  ];

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}
