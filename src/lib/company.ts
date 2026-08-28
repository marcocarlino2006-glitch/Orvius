/** Legal entity + brand — single source of truth for site copy and agreements. */
export const company = {
  legalName: "Solution Development LLC",
  productName: "Orvius",
  domain: "orvius.im",
  contactEmail: "hello@orvius.im",
  supportEmail: "hello@orvius.im",
  foundedYear: 2026,
  trades: ["HVAC", "Plumbing", "Electrical"] as const,
  tagline: "The AI operating partner for service businesses.",
  jurisdictionNote:
    "the state in which Solution Development LLC is organized",
} as const;

export const pricing = {
  pilot: {
    name: "Design partner pilot",
    price: 0,
    period: "30 days",
    limit: "First 10 shops",
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
