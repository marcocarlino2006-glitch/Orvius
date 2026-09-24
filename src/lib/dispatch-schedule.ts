import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { rankTechnicians, type TechCandidate } from "@/lib/technician-match";
import { classifyRequest } from "@/lib/trade-playbooks";

export type ScheduleJobInput = {
  id: string;
  title: string;
  status: string;
  scheduledAt: Date | null;
  durationMin: number | null;
  technicianId: string | null;
  serviceType: string | null;
  notes: string | null;
  urgency: string | null;
  address: string | null;
  postalCode: string | null;
  customerName: string | null;
};

export type ScheduleTech = { id: string; name: string; phone: string | null; skills: string[] };

export type ScheduleBlock = {
  id: string;
  title: string;
  status: string;
  urgency: string | null;
  customerName: string | null;
  address: string | null;
  startMin: number;
  endMin: number;
  skill: string;
  conflict: string | null;
};

export type ScheduleLane = {
  technician: ScheduleTech;
  blocks: ScheduleBlock[];
  bookedMin: number;
};

export type UnassignedItem = {
  id: string;
  title: string;
  urgency: string | null;
  customerName: string | null;
  address: string | null;
  startMin: number | null;
  endMin: number | null;
  skill: string;
  recommendation: { technicianId: string; name: string; reason: string } | null;
  blocked: string | null;
};

export type DispatchSchedule = {
  window: { startMin: number; endMin: number };
  lanes: ScheduleLane[];
  unassigned: UnassignedItem[];
  conflicts: { technicianId: string; jobIds: string[]; message: string }[];
};

/** Less than this between jobs in different ZIPs is not enough to drive. */
const TRAVEL_BUFFER_MIN = 30;

const minutesInto = (date: Date, dayStart: Date) => Math.round((date.getTime() - dayStart.getTime()) / 60_000);

/**
 * One day of dispatch as a schedule: lanes per technician on a shared time
 * axis, conflicts named in plain words, and a recommended technician for each
 * unassigned job. Recommendations are made in time order and each one books
 * the technician for the rest, so two recommendations never collide.
 */
export function buildDispatchSchedule(input: {
  business: { trade?: string | null; servicesJson?: string | null };
  crew: ScheduleTech[];
  jobs: ScheduleJobInput[];
  dayStart: Date;
}): DispatchSchedule {
  const classify = (job: ScheduleJobInput) =>
    classifyRequest({
      business: input.business,
      serviceType: job.serviceType ?? job.title,
      notes: job.notes,
      urgency: job.urgency,
    });
  const duration = (job: ScheduleJobInput, fallback: number) => job.durationMin ?? fallback ?? DEFAULT_JOB_DURATION_MIN;
  const open = input.jobs.filter((j) => j.status !== "cancelled");

  const conflicts: DispatchSchedule["conflicts"] = [];
  const lanes: ScheduleLane[] = input.crew.map((technician) => {
    const mine = open
      .filter((j) => j.technicianId === technician.id && j.scheduledAt)
      .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime());
    const blocks: ScheduleBlock[] = mine.map((job) => {
      const playbook = classify(job);
      const startMin = minutesInto(job.scheduledAt!, input.dayStart);
      return {
        id: job.id,
        title: job.title,
        status: job.status,
        urgency: job.urgency,
        customerName: job.customerName,
        address: job.address,
        startMin,
        endMin: startMin + duration(job, playbook.service.durationMin),
        skill: playbook.service.skill,
        conflict: null,
      };
    });
    for (let i = 1; i < blocks.length; i++) {
      const prev = blocks[i - 1]!;
      const cur = blocks[i]!;
      const prevJob = mine[i - 1]!;
      const curJob = mine[i]!;
      if (cur.startMin < prev.endMin) {
        const message = `${technician.name} is double-booked: ${prev.title} runs until ${clock(prev.endMin, input.dayStart)} but ${cur.title} starts at ${clock(cur.startMin, input.dayStart)}.`;
        cur.conflict = message;
        prev.conflict ??= message;
        conflicts.push({ technicianId: technician.id, jobIds: [prev.id, cur.id], message });
      } else if (
        cur.startMin - prev.endMin < TRAVEL_BUFFER_MIN &&
        prevJob.postalCode &&
        curJob.postalCode &&
        prevJob.postalCode !== curJob.postalCode
      ) {
        const gap = cur.startMin - prev.endMin;
        const message = `${technician.name} has ${gap} min to get from ${prevJob.postalCode} to ${curJob.postalCode} before ${cur.title}.`;
        cur.conflict = message;
        conflicts.push({ technicianId: technician.id, jobIds: [prev.id, cur.id], message });
      }
    }
    return { technician, blocks, bookedMin: blocks.reduce((sum, b) => sum + (b.endMin - b.startMin), 0) };
  });

  const candidates: TechCandidate[] = lanes.map((lane) => ({
    id: lane.technician.id,
    name: lane.technician.name,
    skills: lane.technician.skills,
    jobs: lane.blocks.map((b) => ({
      id: b.id,
      scheduledAt: new Date(input.dayStart.getTime() + b.startMin * 60_000),
      durationMin: b.endMin - b.startMin,
    })),
  }));

  const pending = open
    .filter((j) => !j.technicianId && j.status !== "completed")
    .sort(
      (a, b) =>
        Number(b.urgency === "emergency") - Number(a.urgency === "emergency") ||
        (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity),
    );
  const unassigned: UnassignedItem[] = pending.map((job) => {
    const playbook = classify(job);
    const minutes = duration(job, playbook.service.durationMin);
    const base = {
      id: job.id,
      title: job.title,
      urgency: job.urgency,
      customerName: job.customerName,
      address: job.address,
      skill: playbook.service.skill,
    };
    if (!job.scheduledAt) {
      return {
        ...base,
        startMin: null,
        endMin: null,
        recommendation: null,
        blocked: "No appointment time yet — set one to see who is free.",
      };
    }
    const startMin = minutesInto(job.scheduledAt, input.dayStart);
    const ranking = rankTechnicians({
      candidates,
      scheduledAt: job.scheduledAt,
      durationMin: minutes,
      skill: playbook.service.skill,
    });
    if (ranking.pick) {
      candidates
        .find((c) => c.id === ranking.pick!.technicianId)
        ?.jobs.push({ id: job.id, scheduledAt: job.scheduledAt, durationMin: minutes });
    }
    return {
      ...base,
      startMin,
      endMin: startMin + minutes,
      recommendation: ranking.pick,
      blocked: ranking.pick ? null : ranking.blocked,
    };
  });

  const times = [
    ...lanes.flatMap((l) => l.blocks.flatMap((b) => [b.startMin, b.endMin])),
    ...unassigned.flatMap((u) => (u.startMin == null ? [] : [u.startMin, u.endMin!])),
  ];
  const startMin = Math.min(7 * 60, ...times.map((t) => Math.floor(t / 60) * 60));
  const endMin = Math.max(19 * 60, ...times.map((t) => Math.ceil(t / 60) * 60));

  return { window: { startMin: Math.max(0, startMin), endMin: Math.min(24 * 60, endMin) }, lanes, unassigned, conflicts };
}

function clock(min: number, dayStart: Date) {
  return new Date(dayStart.getTime() + min * 60_000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
