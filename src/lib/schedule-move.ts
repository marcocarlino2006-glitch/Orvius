import type { DispatchSchedule } from "@/lib/dispatch-schedule";

export type MovePreview = {
  jobId: string;
  title: string;
  fromName: string;
  toName: string;
  toTechId: string | null;
  fromTechId: string | null;
  /** Problems the owner should see before saying yes. */
  conflicts: string[];
  /** Who hears about it, and how, once it's saved. */
  notify: string[];
};

function clock(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}

const first = (name: string) => name.split(/\s+/)[0] ?? name;

/**
 * What handing a job to someone else changes, worked out before anything is
 * saved: overlaps on the new person's day, time off, a missing skill, and who
 * gets a text. The appointment time stays put, so the customer is not texted.
 */
export function previewMove(
  schedule: DispatchSchedule,
  jobId: string,
  toTechId: string | null,
): MovePreview | null {
  let block: { id: string; title: string; startMin: number | null; endMin: number | null; skill: string } | null = null;
  let fromTechId: string | null = null;
  for (const lane of schedule.lanes) {
    const hit = lane.blocks.find((b) => b.id === jobId);
    if (hit) {
      block = hit;
      fromTechId = lane.technician.id;
      break;
    }
  }
  if (!block) block = schedule.unassigned.find((u) => u.id === jobId) ?? null;
  if (!block) return null;

  const fromLane = schedule.lanes.find((l) => l.technician.id === fromTechId) ?? null;
  const toLane = schedule.lanes.find((l) => l.technician.id === toTechId) ?? null;
  const fromName = fromLane?.technician.name ?? "Unassigned";
  const toName = toLane?.technician.name ?? "Unassigned";

  const conflicts: string[] = [];
  if (toLane) {
    if (toLane.offAllDay) conflicts.push(`${first(toName)} is off: ${toLane.availability ?? "not working this day"}.`);
    else if (toLane.availability) conflicts.push(`${first(toName)}: ${toLane.availability}.`);
    if (block.startMin != null && block.endMin != null) {
      for (const other of toLane.blocks) {
        if (other.id === jobId) continue;
        if (other.startMin < block.endMin && block.startMin < other.endMin) {
          conflicts.push(`Overlaps ${other.title} (${clock(other.startMin)}–${clock(other.endMin)}).`);
        }
      }
    }
    const skills = toLane.technician.skills;
    if (skills.length && block.skill && block.skill !== "general" && !skills.includes(block.skill)) {
      conflicts.push(`${first(toName)} isn't set up for ${block.skill.replace(/_/g, " ")} work.`);
    }
  }

  const notify: string[] = [];
  if (toTechId) {
    notify.push(
      toLane?.technician.phone
        ? `${first(toName)} gets a text with the job.`
        : `${first(toName)} has no mobile on file — tell them yourself.`,
    );
  }
  if (fromTechId && fromTechId !== toTechId) {
    notify.push(
      fromLane?.technician.phone
        ? `${first(fromName)} gets a text that it's off their day.`
        : `${first(fromName)} has no mobile on file — tell them it moved.`,
    );
  }
  notify.push("The customer isn't texted: the appointment time doesn't change.");

  return { jobId, title: block.title, fromName, toName, toTechId, fromTechId, conflicts, notify };
}
