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

We built the night-shift line for HVAC and plumbing shops — answers missed and after-hours calls on a dedicated number (or anything you forward to it), qualifies the job, proposes a window, and texts you the summary. Looking for 10 shops on a free 30-day pilot — I do the setup. Open to a 10-minute walkthrough this week?`,
  },
  {
    id: "cold_dm",
    label: "Text / DM",
    channel: "SMS / DM",
    body: `Hi [Name], I set up a demo of [Business]'s phone being answered by Orvius. Tap it and talk like one of your customers would: it answers as [Business], takes down the job, and shows you the text you'd get after the call. 20 seconds, no signup: [Link]`,
  },
  {
    id: "follow_up",
    label: "Follow-up",
    channel: "Any",
    body: `Did you get a chance to hear [Business] answer? Here's the link again: [Link]. If it sounds right, I can have it answering your missed calls today.`,
  },
] as const;

export function fillOutreachTemplate(
  body: string,
  vars: { name?: string; business?: string; you?: string; link?: string },
): string {
  return body
    .replaceAll("[Link]", vars.link?.trim() || "orvius.im/try")
    .replaceAll("[Name]", vars.name?.trim() || "[Name]")
    .replaceAll("[Business]", vars.business?.trim() || "[Business]")
    .replaceAll("[You]", vars.you?.trim() || "[You]");
}
