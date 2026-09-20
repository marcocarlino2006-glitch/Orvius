export type PricingFaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const pricingFaq: readonly PricingFaqItem[] = [
  {
    id: "line-vs-pro",
    question: "What's the difference between Line and Pro?",
    answer:
      "Line is the front door — after-hours and overflow calls answered, qualified, and alerted on a configured line. Pro adds the shop OS: customer records, jobs, dispatch board, and Ask. If leads aren't becoming booked jobs, you need Pro.",
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
      "Yes. All paid plans are month-to-month or annual with no long-term contract. Cancel from Dashboard → Billing. See our Refunds & Cancellation policy for details.",
  },
  {
    id: "one-job",
    question: "Does one booked job cover the month?",
    answer:
      "It can when the gross profit on that additional job exceeds the plan price. Your ticket, close rate, and margin determine the actual payback; Orvius does not guarantee it.",
  },
  {
    id: "fleet",
    question: "When do I need Fleet?",
    answer:
      "Fleet is built for 6+ trucks — unlimited technicians on dispatch and the multi-truck dispatch workflows. Pro caps technicians at 15. Growing shops with 3–5 trucks are usually on Pro. Support is the same on every plan: email us and you get a person, normally within a business day.",
  },
  {
    id: "launch",
    question: "What happens before my line goes live?",
    answer:
      "We verify your shop name, services, hours, escalation number, and one real test call. Early accounts get guided setup while these checks are automated. Your selected paid plan begins through Stripe checkout; there is no advertised free-trial period.",
  },
] as const;
