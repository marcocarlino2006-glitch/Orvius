import { getAiModelPolicy, AI_POLICY_VERSION } from "@/lib/ai-policy";
import {
  inferExplicitUrgency,
  isLeadQualifiedForBooking,
} from "@/lib/auto-job";
import { buildAssistantSystemPrompt } from "@/lib/business";
import { deriveDemandSignal } from "@/lib/demand-capture";
import type { DemandCategoryCode } from "@/lib/job-taxonomy";
import type { Trade } from "@/lib/trades";

export type ReceptionistEvalCase = {
  id: string;
  trade: Trade;
  utterance: string;
  address?: string;
  expectedCategory: DemandCategoryCode | null;
  expectedUrgency: ReturnType<typeof inferExplicitUrgency>;
  shouldBook: boolean;
  safety: boolean;
};

/**
 * Versioned regression set: terse callers, hazards, noise, and ordinary work.
 * Add production failures here before changing a prompt or model.
 */
export const RECEPTIONIST_EVAL_CASES: ReceptionistEvalCase[] = [
  {
    id: "hvac-no-cool-today",
    trade: "HVAC",
    utterance: "My AC is out and I need someone today",
    address: "18 Oak St, Austin TX 78701",
    expectedCategory: "hvac.no_cool",
    expectedUrgency: "same-day",
    shouldBook: true,
    safety: false,
  },
  {
    id: "hvac-maintenance-flexible",
    trade: "HVAC",
    utterance: "No rush, I need the annual furnace tune-up",
    expectedCategory: "hvac.maintenance",
    expectedUrgency: "flexible",
    shouldBook: true,
    safety: false,
  },
  {
    id: "plumbing-gas-over-equipment",
    trade: "Plumbing",
    utterance: "Emergency, I smell gas beside the water heater",
    address: "90 Main St, Austin TX 78702",
    expectedCategory: "plumb.gas",
    expectedUrgency: "emergency",
    shouldBook: true,
    safety: true,
  },
  {
    id: "plumbing-water-heater",
    trade: "Plumbing",
    utterance: "There is no hot water",
    expectedCategory: "plumb.water_heater",
    expectedUrgency: null,
    shouldBook: true,
    safety: false,
  },
  {
    id: "plumbing-burst-pipe",
    trade: "Plumbing",
    utterance: "Burst pipe, water everywhere",
    expectedCategory: "plumb.leak",
    expectedUrgency: "emergency",
    shouldBook: true,
    safety: true,
  },
  {
    id: "electrical-sparking-panel",
    trade: "Electrical",
    utterance: "The breaker panel is sparking and smells burned",
    address: "70 Pine St, Austin TX 78703",
    expectedCategory: "elec.hazard",
    expectedUrgency: "emergency",
    shouldBook: true,
    safety: true,
  },
  {
    id: "electrical-ev",
    trade: "Electrical",
    utterance: "Whenever works, I want a level 2 Tesla charger",
    expectedCategory: "elec.ev_charger",
    expectedUrgency: "flexible",
    shouldBook: true,
    safety: false,
  },
  {
    id: "out-of-trade",
    trade: "HVAC",
    utterance: "My breaker keeps tripping",
    expectedCategory: "elec.breaker",
    expectedUrgency: null,
    shouldBook: true,
    safety: false,
  },
  {
    id: "sales-noise",
    trade: "HVAC",
    utterance: "Calling about SEO advertising for your furnace company",
    expectedCategory: "other.non_service",
    expectedUrgency: null,
    shouldBook: false,
    safety: false,
  },
  {
    id: "unknown-no-guess",
    trade: "Plumbing",
    utterance: "Please call me back",
    expectedCategory: null,
    expectedUrgency: null,
    shouldBook: false,
    safety: false,
  },
];

export type EvalFailure = {
  caseId: string;
  check: string;
  expected: unknown;
  actual: unknown;
};

export type AiReadinessEval = {
  policyVersion: string;
  model: ReturnType<typeof getAiModelPolicy>;
  cases: number;
  checks: number;
  passed: number;
  failures: EvalFailure[];
  promptChecks: Array<{ name: string; passed: boolean }>;
};

export function runAiReadinessEval(): AiReadinessEval {
  const failures: EvalFailure[] = [];
  let checks = 0;

  for (const testCase of RECEPTIONIST_EVAL_CASES) {
    const signal = deriveDemandSignal({
      serviceType: testCase.utterance,
      notes: testCase.utterance,
      address: testCase.address,
      trade: testCase.trade,
    });
    const urgency = inferExplicitUrgency(testCase.utterance);
    const shouldBook = isLeadQualifiedForBooking({
      phone: "+15125550123",
      serviceType: testCase.utterance,
      address: testCase.address,
      categoryCode: signal.categoryCode,
    });
    const safety =
      urgency === "emergency" &&
      (signal.categoryCode === "plumb.gas" ||
        signal.categoryCode === "elec.hazard" ||
        /\b(burst pipe|flooding|water everywhere)\b/i.test(
          testCase.utterance,
        ));

    const assertions = [
      ["category", testCase.expectedCategory, signal.categoryCode],
      ["urgency", testCase.expectedUrgency, urgency],
      ["booking", testCase.shouldBook, shouldBook],
      ["safety", testCase.safety, safety],
    ] as const;
    for (const [check, expected, actual] of assertions) {
      checks += 1;
      if (expected !== actual) {
        failures.push({ caseId: testCase.id, check, expected, actual });
      }
    }
  }

  const prompt = buildAssistantSystemPrompt({
    name: "Evaluation Service Co",
    greeting: "Thanks for calling Evaluation Service Co.",
    hoursJson: JSON.stringify({
      monday: { open: "08:00", close: "17:00" },
    }),
    servicesJson: JSON.stringify([{ name: "Emergency repair" }]),
    trade: "HVAC",
  });
  const promptChecks = [
    {
      name: "automated disclosure",
      passed: /recorded and assisted by an automated receptionist/i.test(prompt),
    },
    {
      name: "identity isolation",
      passed: /for Evaluation Service Co ONLY/i.test(prompt),
    },
    {
      name: "no invented pricing or arrival",
      passed:
        /NEVER invent pricing, arrival times, or technician names/.test(prompt) &&
        /NEVER promise a specific arrival time/.test(prompt),
    },
    {
      name: "life safety",
      passed: /leave the area and call 911/i.test(prompt),
    },
    {
      name: "callback verification",
      passed: /callback number \(read it back\)/i.test(prompt),
    },
    {
      name: "shop facts",
      passed:
        prompt.includes("monday: 08:00 - 17:00") &&
        prompt.includes("Emergency repair"),
    },
  ];

  for (const promptCheck of promptChecks) {
    checks += 1;
    if (!promptCheck.passed) {
      failures.push({
        caseId: "system-prompt",
        check: promptCheck.name,
        expected: true,
        actual: false,
      });
    }
  }

  return {
    policyVersion: AI_POLICY_VERSION,
    model: getAiModelPolicy("receptionist"),
    cases: RECEPTIONIST_EVAL_CASES.length,
    checks,
    passed: checks - failures.length,
    failures,
    promptChecks,
  };
}
