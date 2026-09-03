/** Named subprocessors — keep Privacy / Security in sync. No fake certifications. */
export const subprocessors = [
  {
    name: "Vercel",
    purpose: "Application hosting and edge delivery",
    data: "Account, application, and log data",
  },
  {
    name: "Twilio",
    purpose: "Telephony, SMS, and related communications",
    data: "Phone numbers, call/SMS metadata and content",
  },
  {
    name: "Vapi",
    purpose: "Voice AI orchestration",
    data: "Call audio/transcripts and related metadata as configured",
  },
  {
    name: "Stripe",
    purpose: "Subscription billing and payment processing",
    data: "Billing contact and payment tokens (card data on Stripe)",
  },
  {
    name: "Google",
    purpose: "OAuth sign-in",
    data: "Account identity (name, email) for authentication",
  },
] as const;
