/**
 * Orvius clarity contract — every screen answers four questions:
 * What is this? What is happening? What should I do next? What happens if I do it?
 *
 * Workflow language for the physical-economy loop (plain owner words).
 */

export type ClarityPurpose = {
  /** What is this page / surface? */
  what: string;
  /** What is happening right now (measured, not theater)? */
  happening?: string;
  /** What should the owner do next? */
  next?: string;
  /** What happens if they take that action? */
  consequence?: string;
  primaryHref?: string;
  primaryLabel?: string;
};

export type WorkflowStageId =
  | "call"
  | "customer"
  | "property"
  | "equipment"
  | "job"
  | "technician"
  | "estimate"
  | "approval"
  | "payment"
  | "followup";

export type WorkflowTrailLink = {
  id: WorkflowStageId;
  label: string;
  href?: string | null;
  state: "done" | "current" | "waiting" | "idle";
};

/** Canonical loop — labels owners already use on the truck. */
export const WORKFLOW_STAGE_LABEL: Record<WorkflowStageId, string> = {
  call: "Call",
  customer: "Customer",
  property: "Property",
  equipment: "Equipment",
  job: "Job",
  technician: "Technician",
  estimate: "Estimate",
  approval: "Approval",
  payment: "Payment",
  followup: "Follow-up",
};

export function buildRecordTrail(input: {
  callId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  estimateId?: string | null;
  invoiceId?: string | null;
  current: WorkflowStageId;
}): WorkflowTrailLink[] {
  const stages: WorkflowTrailLink[] = [
    {
      id: "call",
      label: WORKFLOW_STAGE_LABEL.call,
      href: input.callId ? `/dashboard/calls/${input.callId}` : null,
      state: "idle",
    },
    {
      id: "customer",
      label: WORKFLOW_STAGE_LABEL.customer,
      href: input.customerId
        ? `/dashboard/customers/${input.customerId}`
        : null,
      state: "idle",
    },
    {
      id: "job",
      label: WORKFLOW_STAGE_LABEL.job,
      href: input.jobId ? `/dashboard/jobs/${input.jobId}` : null,
      state: "idle",
    },
    {
      id: "estimate",
      label: WORKFLOW_STAGE_LABEL.estimate,
      href: input.estimateId
        ? `/dashboard/jobs/${input.jobId ?? ""}#estimate`
        : input.jobId
          ? `/dashboard/jobs/${input.jobId}`
          : null,
      state: "idle",
    },
    {
      id: "payment",
      label: WORKFLOW_STAGE_LABEL.payment,
      href: input.invoiceId
        ? `/dashboard/jobs/${input.jobId ?? ""}#invoice`
        : input.jobId
          ? `/dashboard/jobs/${input.jobId}`
          : "/dashboard/billing",
      state: "idle",
    },
    {
      id: "followup",
      label: WORKFLOW_STAGE_LABEL.followup,
      href: "/dashboard/inbox",
      state: "idle",
    },
  ];

  const order = stages.map((s) => s.id);
  const currentIdx = order.indexOf(input.current);

  return stages.map((stage, idx) => {
    const hasLink = Boolean(stage.href);
    let state: WorkflowTrailLink["state"] = "idle";
    if (idx === currentIdx) state = "current";
    else if (idx < currentIdx && hasLink) state = "done";
    else if (idx === currentIdx + 1) state = "waiting";
    return { ...stage, state };
  });
}

export const PAGE_CLARITY = {
  command: {
    what: "Command is your night-shift home — what Orvius handled and what still needs you.",
    happening: "Live line health, today’s measured outcomes, and the priority queue.",
    next: "Clear the highest-priority action, or prove the line if setup is unfinished.",
    consequence:
      "Acting here books jobs, reconnects alerts, and keeps after-hours revenue from walking.",
    primaryHref: "#attention-board",
    primaryLabel: "Open priority queue",
  } satisfies ClarityPurpose,
  inbox: {
    what: "Inbox holds every qualified lead from calls and texts.",
    happening: "Newest first — call, book, or clear what is still open.",
    next: "Open the top new lead and call them back.",
    consequence:
      "Calling or booking moves the lead forward and keeps the job from going to a competitor.",
    primaryHref: undefined,
    primaryLabel: undefined,
  } satisfies ClarityPurpose,
  calls: {
    what: "Calls is the transcript and recording of every inbound conversation.",
    happening: "Each call is filed against a customer and often a lead or job.",
    next: "Open a call to review what Orvius understood, then jump to the lead or job.",
    consequence:
      "Correcting a call or booking from it updates the real customer record — nothing is siloed.",
    primaryHref: "/dashboard/inbox",
    primaryLabel: "Open Inbox",
  } satisfies ClarityPurpose,
  jobs: {
    what: "Jobs is your booked work — schedule, tech, estimate, and payment in one place.",
    happening: "Pipeline stages show what is booked, in progress, or waiting on money.",
    next: "Assign a tech or advance the next job that needs a status change.",
    consequence:
      "Status changes notify the customer path and keep revenue and crew aligned.",
    primaryHref: "/dashboard/inbox",
    primaryLabel: "Book from Inbox",
  } satisfies ClarityPurpose,
  settings: {
    what: "Settings controls how Orvius answers, alerts you, and books work.",
    happening: "Changes apply to your live night line when you save.",
    next: "Finish the highlighted next step, then save.",
    consequence:
      "Saving updates the live receptionist, overflow capture, and owner alerts immediately.",
    primaryHref: "#overflow-forward",
    primaryLabel: "Review capture",
  } satisfies ClarityPurpose,
  customers: {
    what: "Customers is the people and properties Orvius has talked to.",
    happening: "Each record links calls, leads, and jobs for that household.",
    next: "Open a customer to see history before you dial.",
    consequence:
      "Edits here stick on the next call — Orvius recognizes returning numbers.",
  } satisfies ClarityPurpose,
} as const;
