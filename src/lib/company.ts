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
  tagline: "The AI operating partner for service businesses.",
  mission:
    "Give every service business the same front-door intelligence big operators use — starting with calls, built for the full shop.",
  jurisdictionNote:
    "the state in which Solution Development LLC is organized",
  smsProgramName: "Orvius Owner Alerts",
  legalUpdated: "August 29, 2026",
} as const;

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
    name: "Design partner pilot",
    price: 0,
    period: "30 days",
    limit: "Limited availability",
    cta: "Apply for free pilot",
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
    cta: "Start with pilot",
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
