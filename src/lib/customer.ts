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

function appendCompoundingNote(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (!next) return existing ?? null;
  const prev = existing?.trim() ?? "";
  if (!prev) return next;

  const prevLines = prev.split("\n").map((l) => l.trim()).filter(Boolean);
  const last = prevLines[prevLines.length - 1] ?? "";
  const lastBody = last.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, "");
  if (last === next || lastBody === next) return prev;

  const stamp = new Date().toISOString().slice(0, 10);
  return `${prev}\n[${stamp}] ${next}`;
}

function mergeAddress(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const next = incoming?.trim();
  if (!next) return existing ?? null;
  const prev = existing?.trim() ?? "";
  if (!prev) return next;
  return next.length > prev.length ? next : prev;
}

/**
 * Ring 2 — find or create a customer for every inbound touch.
 * Merges by normalized phone per business.
 */
export async function findOrCreateCustomer(touch: CustomerTouch) {
  return (await findOrCreateCustomerDetailed(touch))?.customer ?? null;
}

/**
 * Same match, plus whether this touch created the customer. countTouch=false
 * lets a retried or already-linked touch refresh details without inflating
 * the interaction count.
 */
export async function findOrCreateCustomerDetailed(
  touch: CustomerTouch,
  options: { countTouch?: boolean } = {},
) {
  const normalized = normalizePhone(touch.phone);
  if (!normalized) {
    return null;
  }
  const countTouch = options.countTouch ?? true;

  const existing = await prisma.customer.findUnique({
    where: {
      businessId_phoneNormalized: {
        businessId: touch.businessId,
        phoneNormalized: normalized,
      },
    },
  });

  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: touch.name?.trim() || existing.name,
        email: touch.email?.trim() || existing.email,
        address: mergeAddress(existing.address, touch.address),
        notes: appendCompoundingNote(existing.notes, touch.notes),
        phone: touch.phone?.trim() || existing.phone,
        ...(countTouch ? { interactionCount: { increment: 1 } } : {}),
        lastSeenAt: new Date(),
      },
    });
    return { customer: updated, created: false };
  }

  try {
    const created = await prisma.customer.create({
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
    return { customer: created, created: true };
  } catch (error) {
    // Two concurrent touches from the same caller: the unique
    // (businessId, phoneNormalized) edge lets exactly one create win.
    if ((error as { code?: string })?.code !== "P2002") throw error;
    const winner = await prisma.customer.findUniqueOrThrow({
      where: {
        businessId_phoneNormalized: { businessId: touch.businessId, phoneNormalized: normalized },
      },
    });
    return { customer: winner, created: false };
  }
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

export async function attachCustomerToJob(jobId: string, customerId: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { customerId },
  });
}

/**
 * Attach every touch (call / lead / job) to one customer brain.
 * Prefer stable caller phone over AI-extracted alternate when both present.
 */
export async function linkTouchToCustomer(
  params: Parameters<typeof linkTouchToCustomerDetailed>[0],
) {
  return (await linkTouchToCustomerDetailed(params))?.customer ?? null;
}

export async function linkTouchToCustomerDetailed(params: {
  businessId: string;
  callId?: string;
  leadId?: string;
  jobId?: string;
  phone?: string | null;
  alternatePhone?: string | null;
  name?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}) {
  const primaryOk = Boolean(normalizePhone(params.phone));
  const resolvedPhone = primaryOk
    ? params.phone
    : (params.alternatePhone ?? params.phone);

  const [call, lead] = await Promise.all([
    params.callId
      ? prisma.call.findUnique({ where: { id: params.callId }, select: { customerId: true } })
      : null,
    params.leadId
      ? prisma.lead.findUnique({ where: { id: params.leadId }, select: { customerId: true } })
      : null,
  ]);
  const alreadyLinked = Boolean(call?.customerId || lead?.customerId);

  const result = await findOrCreateCustomerDetailed(
    {
      businessId: params.businessId,
      phone: resolvedPhone,
      name: params.name,
      email: params.email,
      address: params.address,
      notes: params.notes,
    },
    { countTouch: !alreadyLinked },
  );

  if (!result) return null;
  const { customer } = result;

  if (params.callId) {
    await attachCustomerToCall(params.callId, customer.id);
  }
  if (params.leadId) {
    await attachCustomerToLead(params.leadId, customer.id);
    await prisma.job.updateMany({
      where: { leadId: params.leadId, customerId: null },
      data: { customerId: customer.id },
    });
  }
  if (params.jobId) {
    await attachCustomerToJob(params.jobId, customer.id);
  }

  return { customer, created: result.created, alreadyLinked };
}

export type TimelineEvent = {
  id: string;
  type: "call" | "lead" | "job" | "estimate" | "invoice" | "payment";
  at: string;
  title: string;
  summary: string | null;
  source: string | null;
  urgency: string | null;
  status: string | null;
  amountCents?: number | null;
};

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export async function getCustomerTimeline(
  customerId: string,
): Promise<TimelineEvent[]> {
  const [calls, leads, jobs] = await Promise.all([
    prisma.call.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.lead.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      include: {
        estimate: {
          include: {
            invoice: {
              include: { payments: true },
            },
          },
        },
      },
    }),
  ]);

  const jobIds = jobs.map((j) => j.id);
  const orphanInvoices =
    jobIds.length > 0
      ? await prisma.invoice.findMany({
          where: {
            jobId: { in: jobIds },
            estimateId: null,
          },
          include: { payments: true },
        })
      : [];

  const events: TimelineEvent[] = [
    ...calls.map((call) => ({
      id: call.id,
      type: "call" as const,
      at: call.createdAt.toISOString(),
      title: ["in-progress", "ringing", "queued"].includes(call.status) ? "Call in progress" : "Inbound call",
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
    ...jobs.map((job) => ({
      id: job.id,
      type: "job" as const,
      at: (job.scheduledAt ?? job.createdAt).toISOString(),
      title: job.title,
      summary: job.address,
      source: "job",
      urgency: job.urgency,
      status: job.status,
    })),
  ];

  for (const job of jobs) {
    const estimate = job.estimate;
    if (estimate) {
      events.push({
        id: estimate.id,
        type: "estimate",
        at: estimate.createdAt.toISOString(),
        title: `Estimate · ${formatMoney(estimate.amountCents)}`,
        summary: estimate.notes ?? `For job: ${job.title}`,
        source: "estimate",
        urgency: null,
        status: estimate.status,
        amountCents: estimate.amountCents,
      });

      const invoice = estimate.invoice;
      if (invoice) {
        events.push({
          id: invoice.id,
          type: "invoice",
          at: invoice.createdAt.toISOString(),
          title: `Invoice · ${formatMoney(invoice.amountCents)}`,
          summary: `Linked to ${job.title}`,
          source: "invoice",
          urgency: null,
          status: invoice.status,
          amountCents: invoice.amountCents,
        });
        for (const payment of invoice.payments) {
          events.push({
            id: payment.id,
            type: "payment",
            at: payment.createdAt.toISOString(),
            title: `Payment · ${formatMoney(payment.amountCents)}`,
            summary: payment.method
              ? `Method: ${payment.method}`
              : "Recorded payment",
            source: "payment",
            urgency: null,
            status: payment.status,
            amountCents: payment.amountCents,
          });
        }
      }
    }
  }

  for (const invoice of orphanInvoices) {
    events.push({
      id: invoice.id,
      type: "invoice",
      at: invoice.createdAt.toISOString(),
      title: `Invoice · ${formatMoney(invoice.amountCents)}`,
      summary: null,
      source: "invoice",
      urgency: null,
      status: invoice.status,
      amountCents: invoice.amountCents,
    });
    for (const payment of invoice.payments) {
      events.push({
        id: payment.id,
        type: "payment",
        at: payment.createdAt.toISOString(),
        title: `Payment · ${formatMoney(payment.amountCents)}`,
        summary: payment.method
          ? `Method: ${payment.method}`
          : "Recorded payment",
        source: "payment",
        urgency: null,
        status: payment.status,
        amountCents: payment.amountCents,
      });
    }
  }

  return events.sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );
}

export type PropertyHistory = {
  address: string;
  jobCount: number;
  lastService: string | null;
  lastAt: string | null;
  nextAt: string | null;
  paidCents: number;
};

const addressKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Each service address this customer has used, with what was done there and what it earned. */
export async function getCustomerProperties(
  customerId: string,
  homeAddress: string | null,
): Promise<PropertyHistory[]> {
  const jobs = await prisma.job.findMany({
    where: { customerId, status: { not: "cancelled" } },
    orderBy: { createdAt: "asc" },
    select: {
      address: true,
      title: true,
      status: true,
      scheduledAt: true,
      completedAt: true,
      createdAt: true,
      invoices: { select: { payments: { select: { id: true, amountCents: true, status: true } } } },
      estimate: { select: { invoice: { select: { payments: { select: { id: true, amountCents: true, status: true } } } } } },
    },
  });

  const byAddress = new Map<string, PropertyHistory>();
  const ensure = (address: string) => {
    const key = addressKey(address);
    let entry = byAddress.get(key);
    if (!entry) {
      entry = { address, jobCount: 0, lastService: null, lastAt: null, nextAt: null, paidCents: 0 };
      byAddress.set(key, entry);
    }
    return entry;
  };
  if (homeAddress?.trim()) ensure(homeAddress.trim());

  const now = Date.now();
  for (const job of jobs) {
    const address = job.address?.trim() || homeAddress?.trim();
    if (!address) continue;
    const entry = ensure(address);
    entry.jobCount += 1;
    const when = job.completedAt ?? job.scheduledAt ?? job.createdAt;
    if (when.getTime() <= now || job.status === "completed") {
      if (!entry.lastAt || when.toISOString() > entry.lastAt) {
        entry.lastAt = when.toISOString();
        entry.lastService = job.title;
      }
    } else if (!entry.nextAt || when.toISOString() < entry.nextAt) {
      entry.nextAt = when.toISOString();
    }
    // An estimate's invoice is usually also linked to the job; count each payment once.
    const payments = [
      ...new Map(
        [...job.invoices.flatMap((i) => i.payments), ...(job.estimate?.invoice?.payments ?? [])].map((p) => [p.id, p]),
      ).values(),
    ];
    entry.paidCents += payments
      .filter((p) => p.status !== "failed" && p.status !== "refunded")
      .reduce((sum, p) => sum + p.amountCents, 0);
  }

  return [...byAddress.values()].sort((a, b) => b.jobCount - a.jobCount);
}
