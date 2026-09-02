export type PricingFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const pricingFaq: readonly PricingFaqItem[] = [
  {
    id: "pilot",
    question: "What do I get with the design partner program?",
    answer:
      "30 days free with a dedicated shop line, AI receptionist, owner SMS alerts, and full Pro workspace access. We onboard your shop personally — no credit card required. After the program, you pick Line, Pro, or Fleet.",
  },
  {
    id: "line-vs-pro",
    question: "What's the difference between Line and Pro?",
    answer:
      "Line is the front door — every call answered, qualified, and alerted. Pro adds the full shop OS: customer records, jobs, dispatch board, and Ask. If leads aren't becoming booked jobs, you need Pro.",
  },
  {
    id: "annual",
    question: "Can I pay annually?",
    answer:
      "Yes. Annual billing saves about 17% compared to monthly — Line from $124/mo, Pro from $249/mo, Fleet from $429/mo when billed yearly. Toggle annual on the pricing page before subscribing.",
  },
  {
    id: "cancel",
    question: "Can I cancel anytime?",
    answer:
      "Yes. All paid plans are month-to-month or annual with no long-term contract. Cancel from Settings → Billing. See our Refunds & Cancellation policy for details.",
  },
  {
    id: "one-job",
    question: "Does one booked job cover the month?",
    answer:
      "For most shops, yes. A single after-hours repair or emergency call often clears a month of Pro. Orvius exists so that call is never voicemail.",
  },
  {
    id: "fleet",
    question: "When do I need Fleet?",
    answer:
      "Fleet is built for 6+ trucks — unlimited technicians on dispatch, priority onboarding, and a dedicated support line. Growing shops with 3–5 trucks are usually on Pro.",
  },
  {
    id: "multi",
    question: "Do you support multiple locations?",
    answer:
      "Yes — Multi-shop is for owners running 2+ locations or franchise groups. Each location gets its own line and AI receptionist with central billing. Email hello@orvius.im for volume pricing.",
  },
  {
    id: "stripe",
    question: "Why does checkout say design partner instead of Subscribe?",
    answer:
      "Self-serve Stripe checkout requires billing to be configured in production. Until then, start with the free design partner program — we'll send a checkout link when your trial ends.",
  },
] as const;
