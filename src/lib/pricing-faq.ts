import { PILOT_DAYS } from "@/lib/billing-entitlement";
import { platformFeePercentLabel } from "@/lib/commercial-terms";
import { LINE_RETENTION_DAYS } from "@/lib/usage-limits";
import { OVERAGE_CENTS_PER_CALL, annualChargeDollars, getPlanById, type PaidPlanId } from "@/lib/pricing-plans";

const calls = (id: PaidPlanId) => (getPlanById(id).includedCalls ?? 0).toLocaleString("en-US");
const annualLine = (id: PaidPlanId) => {
  const plan = getPlanById(id);
  return `${plan.name} $${annualChargeDollars(plan).toLocaleString("en-US")}/yr ($${plan.annualPrice}/mo)`;
};

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
      "Both plans answer, qualify and book your calls, and both include the lead inbox, customer records, jobs, text-to-pay and Ask. Line is for one person running the work, with one technician. Pro adds the dispatch board and up to 15 technicians, so you need it once you're sending a crew.",
  },
  {
    id: "annual",
    question: "Can I pay annually?",
    answer:
      `Yes. A year costs ten months: ${annualLine("line")}, ${annualLine("pro")}, ${annualLine("fleet")}. It is charged once a year. Included calls still reset every month.`,
  },
  {
    id: "calls",
    question: "What if we get more calls than the plan includes?",
    answer:
      `Every call is still answered; the line never stops at a limit. Line includes ${calls("line")} answered calls a month, Pro ${calls("pro")}, Fleet ${calls("fleet")}. The count resets on the 1st. Each answered call past the allowance is ${OVERAGE_CENTS_PER_CALL}¢, invoiced to your card after the month ends, and Billing shows the running count.`,
  },
  {
    id: "payments-fee",
    question: "Do you take a cut of deposits and payments?",
    answer:
      `${platformFeePercentLabel()} of each deposit, invoice or service-plan payment a customer makes by card through Orvius, on top of Stripe's standard processing on your own Stripe account. That is separate from your Orvius plan: the money settles to your bank, never to us. Cash, checks and bank transfers you record by hand carry no fee.`,
  },
  {
    id: "cancel",
    question: "Can I cancel anytime?",
    answer:
      `Yes. No plan has a contract. Settings → Billing → Manage opens Stripe, where you cancel; you keep everything until the end of the period you paid for. Then the line stops answering, your number is held ${LINE_RETENTION_DAYS} days in case you come back, and your records stay downloadable. Plans aren't refunded for unused time; billing errors are, within 14 days.`,
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
      `When you run more than 15 technicians on dispatch, or answer more than ${calls("pro")} calls a month. Fleet has the same workspace as Pro with no technician cap and ${calls("fleet")} included calls. Support is the same on every plan: email us and a person answers, normally within a business day.`,
  },
  {
    id: "launch",
    question: "What happens before my line goes live?",
    answer:
      `We verify your shop name, services, hours, escalation number, and one real test call. Card signup starts the paid plan you pick through Stripe checkout; there is no advertised free-trial period. A guided Pilot, booked through a call audit, runs ${PILOT_DAYS} days at no charge.`,
  },
] as const;
