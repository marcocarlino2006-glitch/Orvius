/** Defensible proof points — capability claims, not fabricated metrics. */
export const trustSignals = [
  { value: "5", label: "Workspace areas", detail: "Inbox through Ask" },
  { value: "24/7", label: "Call coverage", detail: "Nights, weekends, peak" },
  { value: "$149+", label: "Flat monthly", detail: "Line, Pro, or Fleet" },
  { value: "2–15", label: "Trucks", detail: "Owner-operator shops" },
] as const;

export const summitCaseStudy = {
  name: "Summit HVAC",
  trade: "HVAC",
  location: "Reference shop",
  crew: "Design partner profile",
  partnerSince: "2026",
  headline: "After-hours emergencies handled without stopping work.",
  summary:
    "Summit runs Orvius on their live line. Every inbound call is qualified, saved to their dashboard, and pushed to the owner by SMS — including nights, weekends, and peak season.",
  outcomes: [
    {
      value: "SMS",
      label: "Owner alerts",
      detail: "Service, urgency, address, callback",
    },
    {
      value: "24/7",
      label: "Line coverage",
      detail: "Answered when crew is on the tools",
    },
    {
      value: "Full",
      label: "Shop record",
      detail: "Inbox, customers, jobs, dispatch",
    },
  ],
  quote:
    "I get the lead on my phone before I finish the job I'm on. After-hours AC calls don't wait in voicemail anymore.",
  attribution: "Summit HVAC · labeled reference implementation — not a third-party case study",
} as const;

export const trustBadges = [
  { label: "SMS with STOP / HELP", detail: "Owner alerts · opt-out honored" },
  { label: "Encrypted in transit", detail: "TLS on every endpoint" },
  { label: "Dedicated shop line", detail: "Your number, your assistant" },
  { label: "Cancel anytime", detail: "No annual lock-in" },
] as const;

export const pricingComparison = [
  {
    label: "Voicemail",
    cost: "Lost jobs",
    pain: "Caller hangs up. Competitor books.",
    highlight: false,
  },
  {
    label: "Smith.ai / bolt-on AI",
    cost: "$150+/mo",
    pain: "Message taken. CRM stays empty.",
    highlight: false,
  },
  {
    label: "Orvius Line",
    cost: "$149/mo",
    pain: "Call → lead → owner alert.",
    highlight: false,
  },
  {
    label: "Orvius Pro",
    cost: "$299/mo",
    pain: "Call → lead → job in one workspace.",
    highlight: true,
  },
  {
    label: "Orvius Fleet",
    cost: "$499/mo",
    pain: "Multi-tech dispatch + priority support.",
    highlight: false,
  },
] as const;
