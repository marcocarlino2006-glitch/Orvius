import type { Business } from "@prisma/client";
import { openWindows, proposeAction, windowLabel, type ProposeOutcome } from "@/lib/copilot-propose";
import { parseShopTime } from "@/lib/owner-text-commands";
import { prisma } from "@/lib/prisma";

/**
 * "Book Maria tomorrow at 2", "move the Carter job to Friday 9am", "send Ben
 * to Maria". The owner asks; Orvius answers with a proposal to approve, real
 * open windows to pick from, or a plain question. It never acts from here.
 */
export type ActVerb = "book" | "move" | "assign";

export function parseActVerb(text: string): { verb: ActVerb; rest: string } | null {
  const t = text.trim().replace(/[.!?]+$/, "");
  const m = t.match(/^(?:please\s+|can you\s+|orvius,?\s+)?(book|schedule|move|reschedule|assign|send)\b\s*(.*)$/i);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const verb: ActVerb = word === "book" || word === "schedule" ? "book" : word === "move" || word === "reschedule" ? "move" : "assign";
  return { verb, rest: m[2] };
}

function tokens(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

/** The candidate whose name appears in the text, with the text left over once it is removed. */
export function matchName<T extends { name: string | null }>(text: string, candidates: T[]): { match: T; rest: string } | { ambiguous: T[] } | null {
  const words = tokens(text);
  const scored = candidates
    .map((c) => {
      const parts = tokens(c.name ?? "");
      const hits = parts.filter((p) => p.length > 1 && words.includes(p));
      return { c, parts, hits };
    })
    .filter((s) => s.hits.length > 0);
  if (!scored.length) return null;
  const best = Math.max(...scored.map((s) => s.hits.length));
  const top = scored.filter((s) => s.hits.length === best);
  if (top.length > 1) return { ambiguous: top.map((s) => s.c) };
  const hit = new Set(top[0].hits);
  const rest = words.filter((w) => !hit.has(w) && w !== "s").join(" ");
  return { match: top[0].c, rest };
}

const FILLER = /\b(for|at|on|to|the|job|appointment|visit|please|in|around|them|her|him)\b/g;

export type AskActResult =
  | { kind: "proposal"; proposal: Extract<ProposeOutcome, { ok: true }>; message: string }
  | { kind: "choices"; message: string; options: { label: string; action: "book_window" | "reschedule"; at: string; leadId?: string; jobId?: string }[] }
  | { kind: "refused"; message: string; alternatives?: string[] }
  | { kind: "clarify"; message: string };

type Shop = Pick<Business, "id" | "name" | "timezone" | "hoursJson" | "servicesJson" | "trade"> & { jobLengthsJson?: string | null };

export async function askToAct(shop: Shop, text: string, now = new Date()): Promise<AskActResult | null> {
  const parsed = parseActVerb(text);
  if (!parsed) return null;
  const tz = shop.timezone ?? "America/New_York";

  if (parsed.verb === "assign") {
    const [techs, jobs] = await Promise.all([
      prisma.technician.findMany({ where: { businessId: shop.id, isActive: true }, select: { id: true, name: true } }),
      prisma.job.findMany({
        where: { businessId: shop.id, status: { in: ["scheduled", "confirmed"] } },
        select: { id: true, title: true, customer: { select: { name: true } }, lead: { select: { name: true } } },
        take: 100,
      }),
    ]);
    const tech = matchName(parsed.rest, techs);
    if (!tech || "ambiguous" in tech) return { kind: "clarify", message: `Which technician? On the crew: ${techs.map((t) => t.name).join(", ") || "nobody yet"}.` };
    const named = jobs.map((j) => ({ ...j, name: j.customer?.name ?? j.lead?.name ?? null }));
    const job = matchName(tech.rest, named);
    if (!job) return { kind: "clarify", message: `Which customer's job should ${tech.match.name} take?` };
    if ("ambiguous" in job) return { kind: "clarify", message: `More than one open job matches: ${job.ambiguous.map((j) => j.name).join(", ")}. Use the full name.` };
    const outcome = await proposeAction(shop, { action: "assign_tech", jobId: job.match.id, technicianId: tech.match.id });
    return outcome.ok
      ? { kind: "proposal", proposal: outcome, message: "Here's the plan. Nothing changes until you approve it." }
      : { kind: "refused", message: outcome.error };
  }

  if (parsed.verb === "book") {
    const leads = await prisma.lead.findMany({
      where: { businessId: shop.id, status: { in: ["new", "contacted"] }, job: { is: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, serviceType: true, notes: true, urgency: true },
    });
    const lead = matchName(parsed.rest, leads);
    if (!lead) return { kind: "clarify", message: "I don't see an open request by that name. Say the caller's name as it shows in Requests." };
    if ("ambiguous" in lead) return { kind: "clarify", message: `More than one request matches: ${lead.ambiguous.map((l) => l.name).join(", ")}. Use the full name.` };
    const whenText = lead.rest.replace(FILLER, " ").trim();
    const at = whenText ? parseShopTime(whenText, tz, now) : null;
    if (!at) {
      const options = await openWindows(shop, { kind: "lead", lead: lead.match }, 3);
      if (!options.length) return { kind: "refused", message: "Nothing is open in the next two weeks for this kind of job. Add a technician or hours, or call to arrange it." };
      return {
        kind: "choices",
        message: whenText
          ? `I couldn't read “${whenText}” as a time. These are open for ${lead.match.name}:`
          : `These are the real open windows for ${lead.match.name}:`,
        options: options.map((d) => ({ label: windowLabel(d, tz), action: "book_window", at: d.toISOString(), leadId: lead.match.id })),
      };
    }
    const outcome = await proposeAction(shop, { action: "book_window", leadId: lead.match.id, at: at.toISOString() });
    return outcome.ok
      ? { kind: "proposal", proposal: outcome, message: "Here's the plan. Nothing changes until you approve it." }
      : { kind: "refused", message: outcome.error, alternatives: outcome.alternatives };
  }

  const jobs = await prisma.job.findMany({
    where: { businessId: shop.id, status: { in: ["scheduled", "confirmed"] } },
    select: { id: true, title: true, serviceType: true, notes: true, urgency: true, durationMin: true, customer: { select: { name: true } }, lead: { select: { name: true } } },
    take: 100,
  });
  const named = jobs.map((j) => ({ ...j, name: j.customer?.name ?? j.lead?.name ?? null }));
  const job = matchName(parsed.rest, named);
  if (!job) return { kind: "clarify", message: "I don't see an open job for that customer." };
  if ("ambiguous" in job) return { kind: "clarify", message: `More than one job matches: ${job.ambiguous.map((j) => j.name).join(", ")}. Use the full name.` };
  const whenText = job.rest.replace(FILLER, " ").trim();
  const at = whenText ? parseShopTime(whenText, tz, now) : null;
  if (!at) {
    const options = await openWindows(shop, { kind: "job", job: job.match }, 3);
    if (!options.length) return { kind: "refused", message: "Nothing is open in the next two weeks to move it to." };
    return {
      kind: "choices",
      message: `These are open for ${job.match.name}'s ${job.match.title}:`,
      options: options.map((d) => ({ label: windowLabel(d, tz), action: "reschedule", at: d.toISOString(), jobId: job.match.id })),
    };
  }
  const outcome = await proposeAction(shop, { action: "reschedule", jobId: job.match.id, at: at.toISOString() });
  return outcome.ok
    ? { kind: "proposal", proposal: outcome, message: "Here's the plan. Nothing changes until you approve it." }
    : { kind: "refused", message: outcome.error, alternatives: outcome.alternatives };
}
