/** Defensible proof points — update metrics when real data is available. */
export const trustSignals = [
  { value: "4", label: "OS modules live", detail: "Front door through field" },
  { value: "24/7", label: "Call coverage", detail: "Nights, weekends, peak" },
  { value: "30 days", label: "Free pilot", detail: "No credit card" },
  { value: "2–15", label: "Trucks", detail: "Owner-operator shops" },
] as const;

export const summitCaseStudy = {
  name: "Summit HVAC",
  trade: "HVAC",
  location: "Austin, TX",
  crew: "8 technicians",
  partnerSince: "August 2026",
  headline: "After-hours emergencies handled without stopping work.",
  summary:
    "Summit runs Orvius on their live line. Every inbound call is qualified, written to the OS, and pushed to the owner by SMS — including nights, weekends, and peak season.",
  outcomes: [
    {
      value: "< 60s",
      label: "Owner alert",
      detail: "Service, urgency, address, callback",
    },
    {
      value: "100%",
      label: "Calls answered",
      detail: "No voicemail tag, no hold queue",
    },
    {
      value: "4 rings",
      label: "OS depth",
      detail: "Inbox, customers, jobs, dispatch",
    },
  ],
  quote:
    "I get the lead on my phone before I finish the job I'm on. After-hours AC calls don't wait in voicemail anymore.",
  attribution: "Summit HVAC · design partner",
} as const;

export const trustBadges = [
  { label: "TCPA-compliant SMS", detail: "Owner alerts with opt-out" },
  { label: "Encrypted in transit", detail: "TLS on every endpoint" },
  { label: "Per-tenant isolation", detail: "Your shop, your data" },
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
    label: "Orvius",
    cost: "$299/mo",
    pain: "Call → lead → job in one OS.",
    highlight: true,
  },
] as const;
