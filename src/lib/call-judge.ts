/**
 * The post-call judge. After every call Vapi's analysis model reads the whole
 * transcript and answers a short rubric written the way a dispatcher at a
 * good HVAC, plumbing or electrical shop would grade a new hire: did they get
 * the problem, ask the questions a tech needs, put safety first, confirm the
 * booking, stick to what they were told, and leave the caller knowing what
 * happens next. Each answer is pass, fail or n/a; a fail becomes a finding on
 * the call with the line the judge quoted.
 *
 * The regex grader in call-quality.ts stays: it is instant and explainable.
 * The judge catches what patterns cannot, like a misunderstood problem.
 */

export type JudgeAnswer = "pass" | "fail" | "n/a";

export type JudgeCheck = {
  key: string;
  /** What the judge is asked. Written so "pass" is always the good answer. */
  question: string;
  /** One sentence for the owner when the answer is fail. */
  failLabel: string;
  severity: "fix" | "watch";
};

const TRIAGE: Record<string, string> = {
  HVAC: "for heating or cooling: is the system running at all, is it blowing air but not cold or warm, any error code or ice, and how old the system is",
  Plumbing: "for plumbing: is water still running and has it been shut off, one fixture or the whole house, and for a water heater whether there is any hot water",
  Electrical: "for electrical: the whole house or one area, whether a breaker tripped, and any burning smell, buzzing or heat at an outlet or panel",
};

export function judgeChecks(trade: string | null | undefined): JudgeCheck[] {
  const triage = TRIAGE[trade ?? ""] ?? "the questions a technician would need before arriving (what is happening, since when, where in the property)";
  return [
    {
      key: "understood_problem",
      question: "Did the receptionist correctly understand what the caller needed, without mixing up the problem, the equipment or the request?",
      failLabel: "Orvius misunderstood what the caller needed.",
      severity: "fix",
    },
    {
      key: "trade_questions",
      question: `On a repair or service call, did the receptionist ask the key questions a dispatcher would, ${triage}? n/a for calls that are not a repair or service request.`,
      failLabel: "Orvius skipped questions a dispatcher would have asked.",
      severity: "watch",
    },
    {
      key: "safety_first",
      question: "If the caller mentioned any hazard (gas smell, carbon monoxide alarm, smoke, sparking, burning smell, water near electrical, sewage), did the receptionist give the safety instruction first and treat it as an emergency? n/a when no hazard came up.",
      failLabel: "A hazard came up and Orvius didn't put safety first.",
      severity: "fix",
    },
    {
      key: "confirmed_booking",
      question: "If a visit was booked or held, did the receptionist read back the day, the time and the address and get the caller's yes? n/a when nothing was booked.",
      failLabel: "Orvius booked a visit without reading back the day, time and address.",
      severity: "watch",
    },
    {
      key: "stuck_to_facts",
      question: "Did the receptionist avoid stating prices, policies, promises or availability it was not given? Fail if it made anything up.",
      failLabel: "Orvius said something it wasn't told: a price, a policy or a promise.",
      severity: "fix",
    },
    {
      key: "clear_next_step",
      question: "Did the caller end the call knowing exactly what happens next (a booked time, a callback, or why not)? n/a if the caller hung up within the first few lines.",
      failLabel: "The caller hung up without knowing what happens next.",
      severity: "watch",
    },
  ];
}

const ANSWERS = ["pass", "fail", "n/a"] as const;

/** The callReview property added to the assistant's structuredDataPlan schema. */
export function judgeSchema(trade: string | null | undefined): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const check of judgeChecks(trade)) {
    properties[check.key] = { type: "string", enum: [...ANSWERS], description: check.question };
  }
  properties.worst_line = {
    type: "string",
    description: "The single receptionist line that most needed to be better, quoted exactly from the transcript. Omit when every answer is pass or n/a.",
  };
  return {
    type: "object",
    description: "Grade the receptionist (the AI), not the caller. Answer every check from the transcript alone; when unsure, answer n/a.",
    properties,
  };
}

export type JudgeVerdict = {
  answers: Record<string, JudgeAnswer>;
  worstLine: string | null;
};

/** The judge's answer from Vapi's structured data, or null when it gave none we can trust. */
export function readJudgeVerdict(structured: unknown): JudgeVerdict | null {
  const raw = (structured as { callReview?: unknown } | null)?.callReview;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const answers: Record<string, JudgeAnswer> = {};
  for (const check of judgeChecks(null)) {
    const value = typeof record[check.key] === "string" ? (record[check.key] as string).trim().toLowerCase() : "";
    if ((ANSWERS as readonly string[]).includes(value)) answers[check.key] = value as JudgeAnswer;
  }
  if (!Object.keys(answers).length) return null;
  const worst = typeof record.worst_line === "string" ? record.worst_line.replace(/\s+/g, " ").trim().slice(0, 240) : "";
  return { answers, worstLine: worst || null };
}

export function judgeFailures(verdict: JudgeVerdict | null): JudgeCheck[] {
  if (!verdict) return [];
  return judgeChecks(null).filter((check) => verdict.answers[check.key] === "fail");
}

export function parseStoredVerdict(json: string | null | undefined): JudgeVerdict | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as JudgeVerdict;
    return parsed && typeof parsed === "object" && parsed.answers ? parsed : null;
  } catch {
    return null;
  }
}
