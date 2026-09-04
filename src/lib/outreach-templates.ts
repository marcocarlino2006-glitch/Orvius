/** Outreach copy for Admin sales cadence — wedge-first, no fake guarantees. */

export type OutreachTemplateId = "cold_call" | "cold_dm" | "follow_up";

export type OutreachTemplate = {
  id: OutreachTemplateId;
  label: string;
  channel: string;
  body: string;
};

export const OUTREACH_DAILY_TARGET = 20;

export const outreachTemplates: readonly OutreachTemplate[] = [
  {
    id: "cold_call",
    label: "Cold call (30s)",
    channel: "Phone",
    body: `Hey [Name], this is [You] with Orvius. Quick question — when you're on a job and a call comes in after hours, what happens to that lead right now?

(Let them talk.)

We built a receptionist for HVAC and plumbing shops that answers missed and after-hours calls, qualifies the job, books it, and texts you the summary. Looking for 10 shops on a free 30-day pilot — I do the setup. Open to a 10-minute walkthrough this week?`,
  },
  {
    id: "cold_dm",
    label: "Text / DM",
    channel: "SMS / DM",
    body: `Hey [Name] — saw [Business] on Google. Curious: how many calls do you miss after hours or while you're on a job?

We're piloting Orvius — answers missed calls, books the job, texts you the lead. Free for 30 days; I set it up for the first 10 shops.

2-min demo → orvius.im/demo`,
  },
  {
    id: "follow_up",
    label: "Follow-up",
    channel: "Any",
    body: `Quick follow-up — one saved emergency job usually covers months of Orvius. Still open to a free pilot this week? I can walk you through the demo in 10 minutes → orvius.im/demo`,
  },
] as const;

export function fillOutreachTemplate(
  body: string,
  vars: { name?: string; business?: string; you?: string },
): string {
  return body
    .replaceAll("[Name]", vars.name?.trim() || "[Name]")
    .replaceAll("[Business]", vars.business?.trim() || "[Business]")
    .replaceAll("[You]", vars.you?.trim() || "[You]");
}
