import { prisma } from "@/lib/prisma";
import { customerDisplayName, displayPhone, normalizePhone } from "@/lib/customer";

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
  type: "customer" | "job" | "lead" | "call";
  id: string;
  href: string;
  title: string;
  summary: string;
  score: number;
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
  for (const term of terms) {
    if (text.includes(term)) score += term.length > 5 ? 3 : 2;
  }
  return score;
}

function formatWhen(iso: Date | string | null | undefined) {
  if (!iso) return "unscheduled";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function retrieveShopMemory(query: string): Promise<ShopMemory> {
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
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfTomorrow = new Date(startOfToday);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);

  const [customers, jobs, leads, calls, stats] = await Promise.all([
    prisma.customer.findMany({
      take: 200,
      orderBy: { lastSeenAt: "desc" },
      include: { business: { select: { name: true } } },
    }),
    prisma.job.findMany({
      take: 120,
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      include: {
        customer: { select: { name: true, phone: true } },
        lead: { select: { name: true, phone: true } },
        technician: { select: { name: true } },
      },
    }),
    prisma.lead.findMany({
      take: 80,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    prisma.call.findMany({
      take: 80,
      orderBy: { createdAt: "desc" },
      include: { customer: { select: { name: true } } },
    }),
    Promise.all([
      prisma.customer.count(),
      prisma.job.count(),
      prisma.lead.count(),
      prisma.call.count(),
    ]),
  ]);

  if (!terms.length && !phone && !wantsToday && !wantsTomorrow && !wantsJobs && !wantsCalls) {
    const briefingJobs = jobs.slice(0, 4).map((job) => {
      const who = job.customer?.name ?? job.lead?.name ?? job.customer?.phone ?? job.lead?.phone;
      return {
        type: "job" as const,
        id: job.id,
        href: `/dashboard/jobs/${job.id}`,
        title: job.title,
        summary: [job.status, who, `scheduled ${formatWhen(job.scheduledAt)}`]
          .filter(Boolean)
          .join(" · "),
        score: 1,
      };
    });
    const briefingCalls = calls.slice(0, 3).map((call) => ({
      type: "call" as const,
      id: call.id,
      href: `/dashboard/calls/${call.id}`,
      title: call.customer?.name ?? call.callerPhone ?? "Inbound call",
      summary: [formatWhen(call.createdAt), call.summary?.slice(0, 160)]
        .filter(Boolean)
        .join(" · "),
      score: 1,
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
    score += 4;
    if (score <= 0 && terms.length) continue;
    if (!terms.length && !phone) continue;
    hits.push({
      type: "customer",
      id: customer.id,
      href: `/dashboard/customers/${customer.id}`,
      title: customerDisplayName(customer.name, customer.phone),
      summary: [
        displayPhone(customer.phone),
        customer.address,
        `${customer.interactionCount} interaction${customer.interactionCount === 1 ? "" : "s"}`,
        `last seen ${formatWhen(customer.lastSeenAt)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
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
    );
    let score = scoreText(text, terms);
    if (wantsJobs) score += 2;
    if (wantsEmergency && job.urgency?.toLowerCase().includes("emergency")) score += 6;
    if (job.scheduledAt) {
      const at = job.scheduledAt;
      if (wantsToday && at >= startOfToday && at < new Date(startOfToday.getTime() + 86400000)) {
        score += 8;
      }
      if (wantsTomorrow && at >= new Date(startOfToday.getTime() + 86400000) && at < endOfTomorrow) {
        score += 8;
      }
    }
    if (phone && (job.customer?.phone.includes(phone) || job.lead?.phone?.includes(phone))) {
      score += 8;
    }
    score += 3;
    if (score <= 0 && !wantsJobs && terms.length) continue;
    if (!terms.length && !wantsJobs && !wantsToday && !wantsTomorrow) continue;
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
        `scheduled ${formatWhen(job.scheduledAt)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
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
        formatWhen(call.createdAt),
        call.summary?.slice(0, 160),
      ]
        .filter(Boolean)
        .join(" · "),
      score: score || 1,
    });
  }

  hits.sort((a, b) => b.score - a.score);

  return {
    query: q,
    hits: hits.slice(0, 8),
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
    const kind = hit.type === "job" ? "Job" : hit.type === "customer" ? "Customer" : hit.type === "lead" ? "Lead" : "Call";
    return `${kind}: ${hit.title} — ${hit.summary}`;
  });

  return `From the shop record:\n${lines.join("\n")}`;
}
