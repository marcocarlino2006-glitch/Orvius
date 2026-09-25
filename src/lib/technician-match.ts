import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { prisma } from "@/lib/prisma";

export type TechCandidate = {
  id: string;
  name: string;
  skills: string[];
  /** Open jobs already on this tech's calendar. */
  jobs: { id: string; scheduledAt: Date; durationMin: number }[];
};

export type TechRecommendation = {
  technicianId: string;
  name: string;
  reason: string;
} | null;

export type TechRanking = {
  pick: TechRecommendation;
  /** Why nobody was picked, when nobody was. */
  blocked: string | null;
  considered: { id: string; name: string; fit: "picked" | "busy" | "no_skill" | "available" }[];
  /** The pick is strictly better than every alternative, so it can be made without asking. */
  clearCut?: boolean;
};

export function parseSkills(skillsJson: string | null | undefined): string[] {
  if (!skillsJson) return [];
  try {
    const parsed = JSON.parse(skillsJson) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
      : [];
  } catch {
    return [];
  }
}

function overlaps(aStart: Date, aMin: number, bStart: Date, bMin: number) {
  const a0 = aStart.getTime();
  const a1 = a0 + aMin * 60_000;
  const b0 = bStart.getTime();
  const b1 = b0 + bMin * 60_000;
  return a0 < b1 && b0 < a1;
}

function sameDay(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/**
 * Pick the technician for one appointment: someone with the skill (or a
 * generalist), with nothing overlapping on their calendar, carrying the
 * lightest day. Specialists beat generalists; ties go to the name order so
 * the same inputs always give the same answer.
 */
export function rankTechnicians(input: {
  candidates: TechCandidate[];
  scheduledAt: Date;
  durationMin: number;
  skill: string | null;
}): TechRanking {
  const considered: TechRanking["considered"] = [];
  const eligible: { tech: TechCandidate; specialist: boolean; dayLoad: number }[] = [];
  const needsSkill = input.skill && input.skill !== "general" ? input.skill : null;

  for (const tech of [...input.candidates].sort((a, b) => a.name.localeCompare(b.name))) {
    const specialist = Boolean(needsSkill && tech.skills.includes(needsSkill));
    const generalist = tech.skills.length === 0;
    if (needsSkill && !specialist && !generalist) {
      considered.push({ id: tech.id, name: tech.name, fit: "no_skill" });
      continue;
    }
    const busy = tech.jobs.some((j) => overlaps(input.scheduledAt, input.durationMin, j.scheduledAt, j.durationMin));
    if (busy) {
      considered.push({ id: tech.id, name: tech.name, fit: "busy" });
      continue;
    }
    const dayLoad = tech.jobs.filter((j) => sameDay(j.scheduledAt, input.scheduledAt)).length;
    eligible.push({ tech, specialist, dayLoad });
    considered.push({ id: tech.id, name: tech.name, fit: "available" });
  }

  if (!eligible.length) {
    const blocked = !input.candidates.length
      ? "No active technicians on the team yet."
      : considered.every((c) => c.fit === "no_skill")
        ? `Nobody on the team has the ${needsSkill?.replace(/_/g, " ")} skill.`
        : "Every qualified technician is already booked at that time.";
    return { pick: null, blocked, considered };
  }

  eligible.sort((a, b) => Number(b.specialist) - Number(a.specialist) || a.dayLoad - b.dayLoad);
  const best = eligible[0]!;
  const runnerUp = eligible[1];
  const clearCut =
    !runnerUp ||
    (best.specialist && !runnerUp.specialist) ||
    (best.specialist === runnerUp.specialist && best.dayLoad < runnerUp.dayLoad);
  const parts = [
    best.specialist ? `has the ${needsSkill?.replace(/_/g, " ")} skill` : needsSkill ? "takes any job" : null,
    "free at that time",
    best.dayLoad === 0 ? "no other jobs that day" : `${best.dayLoad} other job${best.dayLoad === 1 ? "" : "s"} that day`,
  ].filter(Boolean);
  for (const c of considered) if (c.id === best.tech.id) c.fit = "picked";
  return {
    pick: { technicianId: best.tech.id, name: best.tech.name, reason: parts.join(", ") },
    blocked: null,
    considered,
    clearCut,
  };
}

export async function loadTechCandidates(businessId: string, excludeJobId?: string): Promise<TechCandidate[]> {
  const techs = await prisma.technician.findMany({
    where: { businessId, isActive: true },
    select: {
      id: true,
      name: true,
      skillsJson: true,
      jobs: {
        where: {
          status: { notIn: ["completed", "cancelled"] },
          scheduledAt: { not: null },
          ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
        },
        select: { id: true, scheduledAt: true, durationMin: true },
      },
    },
  });
  return techs.map((t) => ({
    id: t.id,
    name: t.name,
    skills: parseSkills(t.skillsJson),
    jobs: t.jobs.flatMap((j) =>
      j.scheduledAt
        ? [{ id: j.id, scheduledAt: j.scheduledAt, durationMin: j.durationMin ?? DEFAULT_JOB_DURATION_MIN }]
        : [],
    ),
  }));
}

export async function recommendTechnician(params: {
  businessId: string;
  scheduledAt: Date;
  durationMin: number | null;
  skill: string | null;
  excludeJobId?: string;
}): Promise<TechRanking> {
  const candidates = await loadTechCandidates(params.businessId, params.excludeJobId);
  return rankTechnicians({
    candidates,
    scheduledAt: params.scheduledAt,
    durationMin: params.durationMin ?? DEFAULT_JOB_DURATION_MIN,
    skill: params.skill,
  });
}
