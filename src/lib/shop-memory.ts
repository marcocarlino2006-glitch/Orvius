import { shopDayBounds } from "@/lib/availability";
import { prisma } from "@/lib/prisma";
import {
  customerDisplayName,
  displayPhone,
  getCustomerTimeline,
  normalizePhone,
} from "@/lib/customer";
import { formatCents } from "@/lib/money";
import { jobOutcomeLabel } from "@/lib/job-outcome";

const STOP = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "what",
  "who",
  "when",
  "where",
  "how",
  "do",
  "does",
  "did",
  "my",
  "our",
  "me",
  "we",
  "to",
  "for",
  "on",
  "in",
  "at",
  "of",
  "and",
  "or",
  "about",
  "tell",
  "show",
  "give",
  "please",
  "with",
  "from",
  "this",
  "that",
  "have",
  "has",
  "been",
  "any",
  "all",
]);

export type MemoryHit = {
  type: "customer" | "job" | "lead" | "call" | "operate";
  id: string;
  href: string;
  title: string;
  summary: string;
  score: number;
  /** Timestamp on the source row, so model context never loses provenance. */
  observedAt: string;
  /** False when the record is finished or already owned, so no action should be offered on it. */
  actionable?: boolean;
};

export type ShopMemory = {
  query: string;
  hits: MemoryHit[];
  stats: {
    customers: number;
    jobs: number;
    leads: number;
    calls: number;
  };
};

function tokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function haystack(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreText(text: string, terms: string[]): number {
  if (!text || !terms.length) return 0;
  let score = 0;
  const padded = ` ${text} `;
  for (const term of terms) {
    // Short words match on boundaries only — "her" must not hit "Thermostat".
    const hit =
      term.length <= 3
        ? new RegExp(`[^a-z0-9]${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`).test(padded)
        : text.includes(term);
    if (hit) score += term.length > 5 ? 3 : 2;
  }
  return score;
}

function formatWhen(iso: Date | string | null | undefined, timeZone: string) {
  if (!iso) return "unscheduled";
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export async function retrieveShopMemory(
  query: string,
  businessId: string,
  knownTimezone?: string,
): Promise<ShopMemory> {
  const q = query.trim();
  const wantsToday = /\btoday\b/i.test(q);
  const wantsTomorrow = /\btomorrow\b/i.test(q);
  const wantsJobs = /\b(job|jobs|schedule|booked|calendar|board)\b/i.test(q);
  const wantsCalls = /\b(call|calls|who called|phone)\b/i.test(q);
  const wantsEmergency = /emergenc/i.test(q);
  const terms = tokens(q);
  if (wantsEmergency && !terms.includes("emergency")) terms.push("emergency");
  const phone = normalizePhone(q) ?? (q.replace(/\D/g, "").length >= 7 ? q.replace(/\D/g, "") : null);
  const now = new Date();
  const tz = knownTimezone ?? (await prisma.business.findUnique({ where: { id: businessId }, select: { timezone: true } }))?.timezone ?? "America/New_York";
  const { start: startOfToday, end: endOfToday } = shopDayBounds(null, tz, now);
  const endOfTomorrow = shopDayBounds(null, tz, new Date(endOfToday.getTime() + 60 * 60 * 1000)).end;
  const tenant = { businessId };

  const customerInclude = { business: { select: { name: true } } } as const;
  const jobInclude = {
    customer: { select: { name: true, phone: true } },
    lead: { select: { name: true, phone: true } },
    technician: { select: { name: true } },
  } as const;
  const leadInclude = { customer: { select: { name: true } }, job: { select: { id: true } } } as const;
  const callInclude = { customer: { select: { name: true } } } as const;

  const statsP = Promise.all([
    prisma.customer.count({ where: tenant }),
    prisma.job.count({ where: tenant }),
    prisma.lead.count({ where: tenant }),
    prisma.call.count({ where: tenant }),
  ]);

  /** The old way: newest rows only. A customer outside the newest 200 was invisible to Ask. */
  const loadRecent = () =>
    Promise.all([
      prisma.customer.findMany({ where: tenant, take: 200, orderBy: { lastSeenAt: "desc" }, include: customerInclude }),
      prisma.job.findMany({
        where: tenant,
        take: 120,
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
        include: jobInclude,
      }),
      prisma.lead.findMany({ where: tenant, take: 80, orderBy: { createdAt: "desc" }, include: leadInclude }),
      prisma.call.findMany({ where: tenant, take: 80, orderBy: { createdAt: "desc" }, include: callInclude }),
    ]);

  /**
   * Search the database, not the newest slice of it: matching rows wherever
   * they sit in the shop's history. Falls back to the recent slice when the
   * targeted read finds nothing (a word that only lives in a call transcript,
   * say), so no question that worked before stops working.
   */
  const loadTargeted = () => {
    const probe = terms.slice(0, 5);
    const flat = (groups: Array<Record<string, unknown>[]>) => groups.flat();
    return Promise.all([
      prisma.customer.findMany({
        where: {
          ...tenant,
          OR: [
            ...flat(probe.map((term) => [{ name: { contains: term } }, { phone: { contains: term } }, { email: { contains: term } }, { address: { contains: term } }, { notes: { contains: term } }])),
            ...(phone ? [{ phone: { contains: phone } }, { phoneNormalized: { contains: phone } }] : []),
          ],
        },
        take: 60,
        orderBy: { lastSeenAt: "desc" },
        include: customerInclude,
      }),
      prisma.job.findMany({
        where: {
          ...tenant,
          OR: [
            ...flat(
              probe.map((term) => [
                { title: { contains: term } },
                { serviceType: { contains: term } },
                { address: { contains: term } },
                { notes: { contains: term } },
                { customer: { name: { contains: term } } },
                { technician: { name: { contains: term } } },
                { lead: { name: { contains: term } } },
              ]),
            ),
            ...(phone ? [{ customer: { phone: { contains: phone } } }, { lead: { phone: { contains: phone } } }] : []),
          ],
        },
        take: 60,
        orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
        include: jobInclude,
      }),
      prisma.lead.findMany({
        where: {
          ...tenant,
          OR: [
            ...flat(
              probe.map((term) => [
                { name: { contains: term } },
                { phone: { contains: term } },
                { serviceType: { contains: term } },
                { address: { contains: term } },
                { notes: { contains: term } },
              ]),
            ),
            ...(phone ? [{ phone: { contains: phone } }] : []),
          ],
        },
        take: 60,
        orderBy: { createdAt: "desc" },
        include: leadInclude,
      }),
      prisma.call.findMany({
        where: {
          ...tenant,
          OR: [
            ...flat(probe.map((term) => [{ callerPhone: { contains: term } }, { summary: { contains: term } }, { customer: { name: { contains: term } } }])),
            ...(phone ? [{ callerPhone: { contains: phone } }] : []),
          ],
        },
        take: 60,
        orderBy: { createdAt: "desc" },
        include: callInclude,
      }),
    ]);
  };

  const targeted = terms.length > 0 || Boolean(phone);
  const [loaded, stats] = await Promise.all([targeted ? loadTargeted() : loadRecent(), statsP]);
  let [customers, jobs, leads, calls] = loaded;
  if (targeted && !customers.length && !jobs.length && !leads.length && !calls.length) {
    [customers, jobs, leads, calls] = await loadRecent();
  }

  if (!terms.length && !phone && !wantsToday && !wantsTomorrow && !wantsJobs && !wantsCalls) {
    const briefingJobs = jobs.slice(0, 4).map((job) => {
      const who = job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? job.lead?.phone;
      return {
        type: "job" as const,
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        title: job.title,
        summary: [job.status, who, `scheduled ${formatWhen(job.scheduledAt, tz)}`]
          .filter(Boolean)
          .join(" · "),
        score: 1,
        observedAt: job.updatedAt.toISOString(),
      };
    });
    const briefingCalls = calls.slice(0, 3).map((call) => ({
      type: "call" as const,
      id: call.id,
      href: `/dashboard/calls/${call.id}`,
      title: call.customer?.name ?? call.callerPhone ?? "Inbound call",
      summary: [formatWhen(call.createdAt, tz), call.summary?.slice(0, 160)]
        .filter(Boolean)
        .join(" · "),
      score: 1,
      observedAt: call.updatedAt.toISOString(),
    }));

    return {
      query: q,
      hits: [...briefingJobs, ...briefingCalls],
      stats: {
        customers: stats[0],
        jobs: stats[1],
        leads: stats[2],
        calls: stats[3],
      },
    };
  }

  const hits: MemoryHit[] = [];

  for (const customer of customers) {
    const text = haystack(
      customer.name,
      customer.phone,
      customer.phoneNormalized,
      customer.email,
      customer.address,
      customer.notes,
    );
    let score = scoreText(text, terms);
    if (phone && (customer.phoneNormalized.includes(phone) || customer.phone.includes(phone))) {
      score += 12;
    }
    if (score <= 0 && terms.length) continue;
    if (!terms.length && !phone) continue;
    score += 4;
    hits.push({
      type: "customer",
      id: customer.id,
      href: `/dashboard/customers/${customer.id}`,
      title: customerDisplayName(customer.name, customer.phone),
      summary: [
        displayPhone(customer.phone),
        customer.address,
        `${customer.interactionCount} interaction${customer.interactionCount === 1 ? "" : "s"}`,
        `last seen ${formatWhen(customer.lastSeenAt, tz)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
      observedAt: customer.updatedAt.toISOString(),
    });
  }

  for (const job of jobs) {
    const who = job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? job.lead?.phone;
    const text = haystack(
      job.title,
      job.serviceType,
      job.address,
      job.notes,
      job.status,
      job.urgency,
      who,
      job.technician?.name,
      job.resolutionCode,
      job.resolutionSummary,
    );
    let score = scoreText(text, terms);
    if (wantsJobs) score += 2;
    if (wantsEmergency && job.urgency?.toLowerCase().includes("emergency")) score += 6;
    if (job.scheduledAt) {
      const at = job.scheduledAt;
      if (wantsToday && at >= startOfToday && at < endOfToday) {
        score += 8;
      }
      if (wantsTomorrow && at >= endOfToday && at < endOfTomorrow) {
        score += 8;
      }
    }
    if (phone && (job.customer?.phone.includes(phone) || job.lead?.phone?.includes(phone))) {
      score += 8;
    }
    if (score <= 0 && !wantsJobs && terms.length) continue;
    if (!terms.length && !wantsJobs && !wantsToday && !wantsTomorrow) continue;
    score += 3;
    hits.push({
      type: "job",
      id: job.id,
      href: `/dashboard/jobs/${job.id}`,
      title: job.title,
      summary: [
        job.status,
        job.technician?.name ?? "unassigned",
        who,
        job.address,
        `scheduled ${formatWhen(job.scheduledAt, tz)}`,
        jobOutcomeLabel(job.resolutionCode),
        job.resolutionSummary,
        job.finalAmountCents != null
          ? `final ${formatCents(job.finalAmountCents)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
      observedAt: job.updatedAt.toISOString(),
      actionable: (job.status === "scheduled" || job.status === "confirmed") && !job.technicianId,
    });
  }

  for (const lead of leads) {
    const text = haystack(
      lead.name,
      lead.phone,
      lead.serviceType,
      lead.urgency,
      lead.address,
      lead.notes,
      lead.status,
    );
    let score = scoreText(text, terms);
    if (phone && lead.phone?.includes(phone)) score += 8;
    if (wantsEmergency && lead.urgency?.toLowerCase().includes("emergency")) score += 5;
    if (score <= 0 && terms.length) continue;
    if (!terms.length && !phone) continue;
    hits.push({
      type: "lead",
      id: lead.id,
      href: `/dashboard/inbox/${lead.id}`,
      title: lead.name ?? lead.serviceType ?? "Lead",
      summary: [
        lead.serviceType,
        lead.urgency?.replace(/-/g, " "),
        lead.phone,
        lead.address,
        lead.status,
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
      observedAt: lead.updatedAt.toISOString(),
      actionable: (lead.status === "new" || lead.status === "contacted") && !lead.job,
    });
  }

  for (const call of calls) {
    const text = haystack(
      call.callerPhone,
      call.summary,
      call.transcript,
      call.customer?.name,
      call.status,
    );
    let score = scoreText(text, terms);
    if (wantsCalls) score += 2;
    if (phone && call.callerPhone?.includes(phone)) score += 8;
    if (score <= 0 && !wantsCalls && terms.length) continue;
    if (!terms.length && !wantsCalls && !phone) continue;
    hits.push({
      type: "call",
      id: call.id,
      href: `/dashboard/calls/${call.id}`,
      title: call.customer?.name ?? call.callerPhone ?? "Inbound call",
      summary: [
        call.status,
        formatWhen(call.createdAt, tz),
        call.summary?.slice(0, 160),
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
      observedAt: call.updatedAt.toISOString(),
    });
  }


  hits.sort((a, b) => b.score - a.score);

  // Expand top customer hits with recent timeline so Ask answers from one record
  for (const hit of hits.filter((h) => h.type === "customer").slice(0, 3)) {
    const timeline = await getCustomerTimeline(hit.id);
    if (!timeline.length) continue;
    const recent = timeline.slice(0, 4).map((e) => e.title).join(" → ");
    hit.summary = `${hit.summary} · Recent: ${recent}`;
  }

  // A strong match (a name, a phone) should not be padded with weak ones.
  const best = hits[0]?.score ?? 0;
  const relevant = hits.filter((h) => h.score >= best * 0.4);

  return {
    query: q,
    hits: relevant.slice(0, 8),
    stats: {
      customers: stats[0],
      jobs: stats[1],
      leads: stats[2],
      calls: stats[3],
    },
  };
}

export function composeMemoryAnswer(memory: ShopMemory): string {
  if (!memory.hits.length) {
    return [
      "Orvius doesn’t have a shop record that matches that.",
      `Memory on file: ${memory.stats.customers} customers, ${memory.stats.jobs} jobs, ${memory.stats.calls} calls.`,
      "Ask about a name, phone, address, or what’s booked today.",
    ].join(" ");
  }

  const lines = memory.hits.slice(0, 5).map((hit) => {
    const kind =
      hit.type === "job"
        ? "Job"
        : hit.type === "customer"
          ? "Customer"
          : hit.type === "lead"
            ? "Lead"
            : hit.type === "operate"
              ? "Next"
              : "Call";
    return `${kind}: ${hit.title} — ${hit.summary}`;
  });

  return `From the shop record:\n${lines.join("\n")}`;
}
