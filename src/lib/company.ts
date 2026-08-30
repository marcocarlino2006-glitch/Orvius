/** Legal entity + brand — single source of truth for site copy and agreements. */
export const company = {
  legalName: "Solution Development LLC",
  productName: "Orvius",
  domain: "orvius.im",
  contactEmail: "hello@orvius.im",
  supportEmail: "hello@orvius.im",
  legalEmail: "hello@orvius.im",
  foundedYear: 2026,
  trades: ["HVAC", "Plumbing", "Electrical"] as const,
  tagline: "The operating system for service businesses.",
  mission:
    "One intelligence layer for the full shop — every call, every customer, every job. We start at the front door.",
  jurisdictionNote:
    "the state in which Solution Development LLC is organized",
  smsProgramName: "Orvius Owner Alerts",
  legalUpdated: "August 29, 2026",
} as const;

/** Orvius OS — expansion rings. One ring at a time; never skip. */
export const osRings = [
  {
    ring: 1,
    name: "Front door",
    module: "Answer · qualify · alert",
    status: "live" as const,
    body: "Every call and text handled. Owner notified with a clean summary.",
  },
  {
    ring: 2,
    name: "Customers",
    module: "Record · history · recognition",
    status: "live" as const,
    body: "Every caller becomes a customer. Full history from first touch.",
  },
  {
    ring: 3,
    name: "Jobs",
    module: "Book · confirm · schedule",
    status: "live" as const,
    body: "Leads become booked appointments — not sticky notes.",
  },
  {
    ring: 4,
    name: "Field",
    module: "Dispatch · assign · status",
    status: "live" as const,
    body: "Who goes where. The day runs from one board.",
  },
  {
    ring: 5,
    name: "Money",
    module: "Estimate · invoice · pay",
    status: "next" as const,
    body: "Revenue flows through the system — not scattered tools.",
  },
  {
    ring: 6,
    name: "Intelligence",
    module: "AI on every layer",
    status: "planned" as const,
    body: "Smarter with every call, job, and payment. Ask lives on the records already in the OS.",
  },
  {
    ring: 7,
    name: "Platform",
    module: "API · integrations · ecosystem",
    status: "planned" as const,
    body: "Other tools plug into Orvius — not the other way around.",
  },
  {
    ring: 8,
    name: "Marketplace",
    module: "Homeowners · match · trust",
    status: "planned" as const,
    body: "Consumers find Orvius-certified pros. Two-sided network.",
  },
] as const;

export const osCurrentRing = 4;

export const legalPages = [
  {
    href: "/terms",
    title: "Terms of Service",
    summary: "Agreement for using Orvius, billing, and acceptable use.",
  },
  {
    href: "/privacy",
    title: "Privacy Policy",
    summary: "How we collect, use, and protect business and caller data.",
  },
  {
    href: "/cookies",
    title: "Cookie Policy",
    summary: "Cookies and similar technologies on orvius.im.",
  },
  {
    href: "/sms-terms",
    title: "SMS Terms",
    summary: "Text message program terms, consent, and opt-out (TCPA).",
  },
  {
    href: "/refunds",
    title: "Refunds & Cancellation",
    summary: "Subscriptions, pilot transitions, and cancellation.",
  },
  {
    href: "/security",
    title: "Security & Compliance",
    summary: "How we protect data and support regulatory responsibilities.",
  },
] as const;

export const platformPillars = [
  {
    title: "Always on",
    body: "Every inbound call and text answered — nights, weekends, peak season.",
  },
  {
    title: "Qualified data",
    body: "Service, urgency, address, and callback captured clean on every lead.",
  },
  {
    title: "Owner control",
    body: "Your hours, services, and line — with alerts when it matters.",
  },
] as const;

export const pricing = {
  pilot: {
    name: "Design partner program",
    price: 0,
    period: "30 days",
    limit: "Limited availability",
    cta: "Apply for design partner",
    href: "/pilot",
    highlights: [
      "Full AI receptionist on your business line",
      "Lead inbox + owner SMS alerts",
      "Personal onboarding with the Orvius team",
      "No credit card required",
    ],
  },
  pro: {
    name: "Orvius Pro",
    price: 299,
    period: "per month",
    cta: "Get started",
    href: "/pilot",
    highlights: [
      "Unlimited inbound calls & texts handled",
      "Qualified leads with urgency, service, and address",
      "Owner alerts via SMS + dashboard",
      "Business hours & services you control",
      "Email support · cancel anytime",
    ],
  },
} as const;
