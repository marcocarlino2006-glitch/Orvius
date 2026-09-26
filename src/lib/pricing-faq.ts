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
      "Yes. Annual billing is two months free — Line from $166/mo, Pro from $333/mo, Fleet from $624/mo when billed yearly. Toggle annual on the pricing page before subscribing.",
  },
  {
    id: "calls",
    question: "What if we get more calls than the plan includes?",
    answer:
      "Every call is still answered — the line never stops at a limit. Line includes 300 answered calls a month, Pro 750, Fleet 1,500. Past that, calls are 50¢ each, and Billing shows the running count so there is no surprise. Most shops stay well inside the allowance.",
  },
  {
    id: "payments-fee",
    question: "Do you take a cut of deposits and payments?",
    answer:
      "1% of each deposit or payment collected through Orvius, on top of Stripe's standard processing on your own Stripe account. You see the amount you keep before you turn deposits on.",
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
      "Fleet is built for 6+ trucks — unlimited technicians on dispatch, 1,500 included calls, and the multi-truck dispatch workflows. Pro caps technicians at 15. Growing shops with 3–5 trucks are usually on Pro. Support is the same on every plan: email us and you get a person, normally within a business day.",
  },
  {
    id: "launch",
    question: "What happens before my line goes live?",
    answer:
      "We verify your shop name, services, hours, escalation number, and one real test call. Early accounts get guided setup while these checks are automated. Your selected paid plan begins through Stripe checkout; there is no advertised free-trial period.",
  },
] as const;
