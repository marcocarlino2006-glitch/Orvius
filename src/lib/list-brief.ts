/** The one line at the top of Jobs. Counts come from the jobs already loaded. */
export function jobsBrief(input: { open: number; needsYou: number; unassigned: number; today: number }): string {
  if (input.open <= 0) return "Nothing is open. A call Orvius books shows up here.";
  const open = input.open === 1 ? "1 job is open." : `${input.open} jobs are open.`;
  const parts: string[] = [];
  if (input.needsYou > 0) parts.push(input.needsYou === 1 ? "1 needs you" : `${input.needsYou} need you`);
  if (input.unassigned > 0) parts.push(input.unassigned === 1 ? "1 has no technician" : `${input.unassigned} have no technician`);
  if (input.today > 0) parts.push(input.today === 1 ? "1 is today" : `${input.today} are today`);
  if (!parts.length) return `${open} None of them need you.`;
  const next = input.unassigned > 0 ? " Assign the open ones on the schedule." : input.needsYou > 0 ? " Start with the ones that need you." : "";
  return `${open} ${parts.join(", ")}.${next}`;
}

/** The one line at the top of Inbox. Null counts mean the list has not loaded. */
export function inboxBrief(counts: { new: number; waiting: number; person: number } | null): string {
  if (!counts) return "Requests that have not become a job yet.";
  if (counts.person > 0) {
    const n = counts.person === 1 ? "1 request needs a person." : `${counts.person} requests need a person.`;
    return `${n} Call them before booking the rest.`;
  }
  if (counts.new > 0) {
    const n = counts.new === 1 ? "1 new request is ready." : `${counts.new} new requests are ready.`;
    return `${n} Book the ones that have an address and a problem.`;
  }
  if (counts.waiting > 0) {
    return counts.waiting === 1
      ? "1 request is waiting on the customer. Nothing to do until they reply."
      : `${counts.waiting} requests are waiting on the customer. Nothing to do until they reply.`;
  }
  return "Nothing is waiting. A booked request moves to Jobs and stays here under Resolved.";
}
