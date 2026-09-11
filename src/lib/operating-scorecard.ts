/**
 * Multibillion-dollar operating scorecard — product source of truth.
 * Docs/OPERATING-SCORECARD.md mirrors this for long-form reading.
 */

export type ScorecardRow = {
  id: string;
  question: string;
  why: string;
};

export type BusinessMetric = {
  id: string;
  metric: string;
  strong: string;
};

export type ExpansionGateId =
  | "pain"
  | "workflow"
  | "pay_retain"
  | "distribution";

export type ExpansionGate = {
  id: ExpansionGateId;
  title: string;
  detail: string;
};

export const SCORECARD_CORE_RULE =
  "Do not confuse activity with progress. Calls made, features shipped, and signups acquired matter only if they produce customer value, retention, and durable economics. Orvius should run the company from a small set of leading and lagging indicators.";

export const CUSTOMER_OUTCOME_METRICS: ScorecardRow[] = [
  {
    id: "front_office",
    question: "Did the customer reach a capable front office?",
    why: "The first promise fails if calls are missed.",
  },
  {
    id: "capture",
    question: "Did Orvius capture the information needed for the next action?",
    why: "Incomplete information creates wasted time and poor customer experience.",
  },
  {
    id: "booking",
    question: "Did Orvius book the right service, area, time, and customer?",
    why: "A wrong booking destroys trust and dispatch efficiency.",
  },
  {
    id: "escalation",
    question: "Did the owner receive a useful escalation with context?",
    why: "Automation must fail safely and preserve the relationship.",
  },
  {
    id: "booked_work",
    question: "Does Orvius create more booked work than the prior process?",
    why: "This is the commercial proof of value.",
  },
  {
    id: "attendance",
    question: "Does Orvius improve attendance and readiness?",
    why: "Bookings are not value if they do not become productive work.",
  },
  {
    id: "paid_faster",
    question: "Does the workflow help the shop get paid faster?",
    why: "This becomes important as Orvius expands toward payments.",
  },
  {
    id: "homeowner_comms",
    question: "Do homeowners receive fast, clear, professional communication?",
    why: "The shop's reputation is part of the product.",
  },
];

export const PRODUCT_QUALITY_COPY = {
  summary:
    "The system should track severe errors separately from ordinary misses. A minor transcript error and a false emergency claim are not equivalent.",
  criticalMetrics: [
    "wrong bookings",
    "invented policies or prices",
    "lost addresses",
    "unauthorized actions",
    "duplicate messages",
    "failed handoffs",
    "unconfirmed payment claims",
    "downtime",
    "latency",
    "unresolved safety incidents",
  ] as const,
  thresholdRule:
    "A category leader should aim for a severe-error rate low enough that owners trust Orvius with real call volume, while maintaining a visible review and rollback process. The exact thresholds must be established from pilot data and risk analysis rather than invented in advance.",
};

export const BUSINESS_METRICS: BusinessMetric[] = [
  {
    id: "activation",
    metric: "Activation time",
    strong:
      "A shop can configure and safely launch without a prolonged services project.",
  },
  {
    id: "ttfv",
    metric: "Time to first value",
    strong:
      "The owner sees a captured lead, booking or useful handoff quickly.",
  },
  {
    id: "paid_conversion",
    metric: "Paid conversion",
    strong:
      "Customers pay because they see value, not because of indefinite free use.",
  },
  {
    id: "gross_retention",
    metric: "Gross retention",
    strong:
      "Customers stay after the founder's personal support is reduced.",
  },
  {
    id: "nrr",
    metric: "Net revenue retention",
    strong:
      "Customers add usage, workflows, locations, and payment volume over time.",
  },
  {
    id: "support_burden",
    metric: "Support burden",
    strong:
      "The product becomes easier to operate as the customer base grows.",
  },
  {
    id: "gross_margin",
    metric: "Gross margin",
    strong:
      "Voice, model, support, and transaction costs allow durable scaling.",
  },
  {
    id: "cac_efficiency",
    metric: "Customer acquisition efficiency",
    strong:
      "Repeatable channels lower the cost of reaching and activating shops.",
  },
  {
    id: "referral",
    metric: "Referral rate",
    strong:
      "Owners and trusted industry partners voluntarily bring in new customers.",
  },
  {
    id: "payment_adoption",
    metric: "Payment adoption",
    strong:
      "Customers choose Orvius payment workflows because they improve operations.",
  },
];

export const EXPANSION_GATES: ExpansionGate[] = [
  {
    id: "pain",
    title: "Gate 1: Pain is real",
    detail:
      "At least 20 owner conversations in the same customer profile confirm a repeated, urgent problem, and at least two owners agree to a defined pilot or paid test.",
  },
  {
    id: "workflow",
    title: "Gate 2: Workflow is reliable",
    detail:
      "Three to five HVAC businesses use the live workflow under controlled scope. Calls are reviewed, business policies are accurate, bookings are confirmed by the underlying calendar or FSM system, and human fallback works.",
  },
  {
    id: "pay_retain",
    title: "Gate 3: Customers pay and retain",
    detail:
      "A meaningful initial cohort pays for continued use, reports measurable value, and remains active after the founders stop manually rescuing every interaction. The exact cohort size is less important than proving repeatability across different shops.",
  },
  {
    id: "distribution",
    title: "Gate 4: Distribution repeats",
    detail:
      "Orvius can acquire and onboard HVAC shops through a repeatable founder-led, partner-led, or referral motion. One founder's personal network is not a distribution strategy.",
  },
];

export type ExpansionGatesState = Record<ExpansionGateId, boolean>;

export function emptyExpansionGates(): ExpansionGatesState {
  return {
    pain: false,
    workflow: false,
    pay_retain: false,
    distribution: false,
  };
}

export function parseExpansionGatesJson(
  raw: string | null | undefined,
): ExpansionGatesState {
  const base = emptyExpansionGates();
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as Partial<ExpansionGatesState>;
    for (const gate of EXPANSION_GATES) {
      base[gate.id] = Boolean(parsed[gate.id]);
    }
  } catch {
    /* keep empty */
  }
  return base;
}

export function serializeExpansionGates(
  state: ExpansionGatesState,
): string {
  return JSON.stringify(state);
}
