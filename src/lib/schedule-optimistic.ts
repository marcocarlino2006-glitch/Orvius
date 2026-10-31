import type { DispatchSchedule, ScheduleBlock, UnassignedItem } from "@/lib/dispatch-schedule";

/**
 * The board moves the moment a job is dropped, before the server answers.
 * The server still decides: a refusal puts the board back exactly as it was,
 * and its answer replaces this guess once it arrives. Times never change here;
 * conflicts and recommendations are left for the server to recompute.
 */
type Found = { block: ScheduleBlock; from: string | null } | null;

function take(schedule: DispatchSchedule, jobId: string): { schedule: DispatchSchedule; found: Found } {
  for (const lane of schedule.lanes) {
    const block = lane.blocks.find((b) => b.id === jobId);
    if (!block) continue;
    return {
      found: { block, from: lane.technician.id },
      schedule: {
        ...schedule,
        lanes: schedule.lanes.map((l) =>
          l === lane ? { ...l, blocks: l.blocks.filter((b) => b.id !== jobId), bookedMin: Math.max(0, l.bookedMin - (block.endMin - block.startMin)) } : l,
        ),
      },
    };
  }
  const item = schedule.unassigned.find((u) => u.id === jobId);
  if (!item || item.startMin == null) return { schedule, found: null };
  const block: ScheduleBlock = {
    id: item.id,
    title: item.title,
    status: "scheduled",
    urgency: item.urgency,
    customerName: item.customerName,
    address: item.address,
    startMin: item.startMin,
    endMin: item.endMin ?? item.startMin + 60,
    skill: item.skill,
    conflict: null,
  };
  return { found: { block, from: null }, schedule: { ...schedule, unassigned: schedule.unassigned.filter((u) => u.id !== jobId) } };
}

function place(schedule: DispatchSchedule, block: ScheduleBlock, laneId: string | null): DispatchSchedule | null {
  if (laneId === null) {
    const item: UnassignedItem = {
      id: block.id,
      title: block.title,
      urgency: block.urgency,
      customerName: block.customerName,
      address: block.address,
      startMin: block.startMin,
      endMin: block.endMin,
      skill: block.skill,
      recommendation: null,
      blocked: null,
    };
    return { ...schedule, unassigned: [...schedule.unassigned, item] };
  }
  if (!schedule.lanes.some((l) => l.technician.id === laneId)) return null;
  return {
    ...schedule,
    lanes: schedule.lanes.map((l) =>
      l.technician.id === laneId
        ? {
            ...l,
            blocks: [...l.blocks, { ...block, conflict: null }].sort((a, b) => a.startMin - b.startMin),
            bookedMin: l.bookedMin + (block.endMin - block.startMin),
          }
        : l,
    ),
  };
}

/** The day's board with one job moved to another technician (or unassigned), or null if it can't be shown. */
export function reassignOnBoard(schedule: DispatchSchedule, jobId: string, laneId: string | null): DispatchSchedule | null {
  const { schedule: without, found } = take(schedule, jobId);
  if (!found || found.from === laneId) return null;
  return place(without, found.block, laneId);
}

/** The week with one job moved to another day and/or technician, same time of day. */
export function moveOnWeek<T extends { day: string; schedule: DispatchSchedule }>(
  days: T[],
  jobId: string,
  laneId: string | null,
  toDay: string,
): T[] | null {
  let found: Found = null;
  const lifted = days.map((d) => {
    if (found) return d;
    const out = take(d.schedule, jobId);
    if (!out.found) return d;
    found = out.found;
    return { ...d, schedule: out.schedule };
  });
  const block = (found as Found)?.block;
  if (!block || !lifted.some((d) => d.day === toDay)) return null;
  let ok = true;
  const moved = lifted.map((d) => {
    if (d.day !== toDay) return d;
    const next = place(d.schedule, block, laneId);
    if (!next) ok = false;
    return next ? { ...d, schedule: next } : d;
  });
  return ok ? moved : null;
}
