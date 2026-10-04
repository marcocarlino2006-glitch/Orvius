import { createHash } from "node:crypto";
import { detectAssistantPromises } from "@/lib/assistant-promises";
import type { CallFinding, CallGrade } from "@/lib/call-quality";
import { SAFETY_GUIDANCE } from "@/lib/safety-guidance";
import { parseTranscript } from "@/lib/transcript";
import { classifyRequest } from "@/lib/trade-playbooks";

/**
 * Real calls that went wrong, turned into voice-sim scenarios.
 *
 * A scenario keeps what went wrong (the finding), the kind of job, the urgency,
 * any hazard and the caller's language. It never keeps the caller's words,
 * name, number or address: the persona gets synthetic facts, so a learned
 * scenario is safe to print in CI logs and to commit. Graders are declarative
 * checks so a scenario can travel as JSON from the app to the simulator.
 */

export type LearnedCheck =
  | { kind: "phone"; tail: string }
  | { kind: "address"; contains: string }
  | { kind: "name"; contains: string }
  | { kind: "urgency"; allowed: string[] }
  | { kind: "safety_guidance" }
  | { kind: "no_promises" }
  | { kind: "one_question_per_turn" }
  | { kind: "short_replies"; maxWords: number }
  | { kind: "no_repeated_question" };

export type LearnedScenario = {
  id: string;
  tier: "hard";
  /** Learned scenarios run nightly but never block a release until promoted into voice-scenarios.mjs. */
  gate: false;
  lang?: "es";
  name: string;
  persona: string;
  tools?: { must?: string[]; never?: string[] };
  checks: LearnedCheck[];
  learnedFrom: { findings: CallFinding["key"][]; service: string; hazard: string | null; urgency: string | null };
};

export type LearnableCall = {
  id: string;
  transcript: string | null;
  summary: string | null;
  lead: { serviceType: string | null; urgency: string | null; notes?: string | null } | null;
  business: { trade?: string | null; servicesJson?: string | null; name?: string | null };
  grade: CallGrade;
};

/** Findings a scripted caller can reproduce. Not-connected, missing transcripts and the like are not about the conversation. */
const LEARNABLE = new Set<CallFinding["key"]>([
  "missing_capture",
  "safety_not_emergency",
  "safety_no_guidance",
  "not_booked",
  "repeated_self",
  "asked_for_person",
  "corrected_orvius",
  "frustrated",
  "asked_twice",
  "stacked_questions",
  "long_reply",
  "dead_air",
]);

const FIRST = ["Alex", "Jamie", "Morgan", "Taylor", "Casey", "Riley", "Jordan", "Avery", "Quinn", "Drew"];
const LAST = ["Harper", "Ellison", "Brooks", "Navarro", "Whitfield", "Okafor", "Lindqvist", "Castillo", "Pryor", "Duval"];
const STREETS = ["Asbury Avenue", "Hinman Avenue", "Dodge Avenue", "Sherman Avenue", "Ridge Avenue", "Colfax Street", "Payne Street", "Central Street", "Lincoln Street", "Noyes Street"];

const HAZARD_LINE: Record<string, string> = {
  gas_smell: "Also, I think I smell gas near the furnace.",
  carbon_monoxide: "Also, our carbon monoxide alarm keeps going off.",
  burning_unit: "Also, there's a burning smell coming from the unit.",
};

const SPANISH = /\b(hola|gracias|por favor|calefacci[oó]n|aire acondicionado|no funciona|mi casa|necesito|se[nñ]or|se[nñ]ora|buenas)\b/i;

function seed(id: string) {
  return createHash("sha256").update(`orvius-learned:${id}`).digest();
}

/** Same call, same synthetic caller: nightly results stay comparable. */
export function syntheticCaller(id: string) {
  const h = seed(id);
  const first = FIRST[h[0] % FIRST.length];
  const last = LAST[h[1] % LAST.length];
  const tail = String(200 + (h.readUInt16BE(2) % 800)).padStart(4, "0");
  const number = `312-555-${tail}`;
  const houseNumber = 100 + (h.readUInt16BE(4) % 2800);
  const street = STREETS[h[6] % STREETS.length];
  return { name: `${first} ${last}`, first, last, number, digits: `312555${tail}`, houseNumber, address: `${houseNumber} ${street}, Evanston 60201` };
}

function callerSpokeSpanish(transcript: string | null) {
  const caller = parseTranscript(transcript).filter((l) => l.role === "caller");
  if (!caller.length) return false;
  return caller.filter((l) => SPANISH.test(l.text)).length * 2 >= caller.length;
}

export function learnScenario(call: LearnableCall): LearnedScenario | null {
  const findings = call.grade.findings.filter((f) => LEARNABLE.has(f.key));
  if (!findings.length) return null;
  const keys = [...new Set(findings.map((f) => f.key))];
  const has = (k: CallFinding["key"]) => keys.includes(k);

  const text = [call.lead?.serviceType, call.summary, call.lead?.notes].filter(Boolean).join(" \n ");
  const request = classifyRequest({ business: call.business, serviceType: text || "diagnostic" });
  const hazard = request.safety;
  const urgency = call.lead?.urgency ?? null;
  const who = syntheticCaller(call.id);
  const es = callerSpokeSpanish(call.transcript);

  const behaviour: string[] = [];
  const checks: LearnedCheck[] = [
    { kind: "phone", tail: who.digits.slice(-7) },
    { kind: "address", contains: String(who.houseNumber) },
    { kind: "no_promises" },
  ];
  const tools: { must?: string[]; never?: string[] } = {};

  if (hazard) {
    behaviour.push(`After the receptionist asks your address, say: "${HAZARD_LINE[hazard.key] ?? `Also, there's a ${hazard.label.toLowerCase()}.`}"`);
    checks.push({ kind: "safety_guidance" }, { kind: "urgency", allowed: ["emergency"] });
    tools.must = ["alert_team_now"];
    tools.never = ["hold_appointment"];
  }
  if (has("missing_capture")) {
    behaviour.push("Give your name and number only when asked, quickly, in one breath. Don't volunteer them.");
    checks.push({ kind: "name", contains: who.last });
  }
  if (has("not_booked") && !hazard) {
    behaviour.push("You want someone out soon. If the receptionist offers times, take the first one.");
    tools.must = ["check_availability", "hold_appointment"];
  }
  if (has("asked_for_person")) behaviour.push('Early on, ask once: "Can I just talk to a real person?" If they explain, let them continue.');
  if (has("corrected_orvius")) {
    behaviour.push(`When they read your number back, say "No, it's ${who.number}" even if they had it right, and make sure they repeat it.`);
  }
  if (has("repeated_self") || has("asked_twice")) {
    behaviour.push('If they ask for something you already gave, say "I already told you that" and give it again.');
    checks.push({ kind: "no_repeated_question" });
  }
  if (has("frustrated")) behaviour.push("You're busy and a little impatient. Keep answers short.");
  if (has("stacked_questions")) checks.push({ kind: "one_question_per_turn" });
  if (has("long_reply") || has("frustrated") || has("dead_air")) checks.push({ kind: "short_replies", maxWords: 45 });
  if (es) behaviour.unshift('You speak ONLY Spanish. If they speak English say "No hablo inglés, ¿habla español?"');

  const urgencyNote = hazard ? "" : urgency === "emergency" ? " It's urgent; the house is uncomfortable and you need someone today." : " It's not an emergency.";
  const persona = `Facts: you need help with: ${request.service.label.toLowerCase()}.${urgencyNote} Name ${who.name}, number ${who.number}, address ${who.address}.
${behaviour.join("\n")}`.trim();

  return {
    id: `learned-${seed(call.id).toString("hex").slice(0, 8)}`,
    tier: "hard",
    gate: false,
    ...(es ? { lang: "es" as const } : {}),
    name: `Learned: ${request.service.label}${hazard ? `, ${hazard.label.toLowerCase()}` : ""} (${keys.join(", ")})`,
    persona,
    ...(tools.must || tools.never ? { tools } : {}),
    checks,
    learnedFrom: { findings: keys, service: request.service.key, hazard: hazard?.key ?? null, urgency },
  };
}

/**
 * The failures worth replaying, one per distinct pattern: fix-verdict calls
 * first, and a pattern seen on many calls is kept once, not ten times.
 */
export function learnScenarios(calls: LearnableCall[], limit = 10): LearnedScenario[] {
  const ranked = [...calls].sort((a, b) => (a.grade.verdict === b.grade.verdict ? a.grade.score - b.grade.score : a.grade.verdict === "fix" ? -1 : 1));
  const out: LearnedScenario[] = [];
  const seen = new Set<string>();
  for (const call of ranked) {
    const scenario = learnScenario(call);
    if (!scenario) continue;
    const pattern = `${scenario.learnedFrom.service}|${scenario.learnedFrom.hazard}|${scenario.lang ?? "en"}|${[...scenario.learnedFrom.findings].sort().join(",")}`;
    if (seen.has(pattern)) continue;
    seen.add(pattern);
    out.push(scenario);
    if (out.length >= limit) break;
  }
  return out;
}

type GradeContext = { ai: string; structured: Record<string, unknown> };

const questions = (line: string) => (line.match(/[^.?!]+\?/g) ?? []).filter((q) => q.trim().split(/\s+/).length >= 3).length;

export function gradeLearned(checks: LearnedCheck[], { ai, structured }: GradeContext): string[] {
  const lines = ai.split("\n").map((l) => l.trim()).filter(Boolean);
  const field = (k: string) => String(structured[k] ?? "");
  const failures: string[] = [];
  for (const check of checks) {
    switch (check.kind) {
      case "phone":
        if (!field("phone").replace(/\D/g, "").endsWith(check.tail)) failures.push(`callback number not captured (got "${field("phone")}")`);
        break;
      case "address":
        if (!field("address").includes(check.contains)) failures.push(`address captured as "${field("address")}"`);
        break;
      case "name":
        if (!field("name").toLowerCase().includes(check.contains.toLowerCase())) failures.push(`name captured as "${field("name")}"`);
        break;
      case "urgency":
        if (!check.allowed.includes(field("urgency"))) failures.push(`urgency "${field("urgency")}", expected ${check.allowed.join(" or ")}`);
        break;
      case "safety_guidance":
        if (!SAFETY_GUIDANCE.test(ai)) failures.push("reported hazard got no safety instruction");
        break;
      case "no_promises":
        for (const p of detectAssistantPromises(lines.map((l) => `AI: ${l}`).join("\n"))) failures.push(`promised ${p.kind}: "${p.quote}"`);
        break;
      case "one_question_per_turn": {
        const stacked = lines.find((l) => questions(l) >= 2);
        if (stacked) failures.push(`asked several questions at once: "${stacked.slice(0, 100)}"`);
        break;
      }
      case "short_replies": {
        const long = lines.find((l) => l.split(/\s+/).length > check.maxWords && !SAFETY_GUIDANCE.test(l) && !/\brecorded\b/i.test(l));
        if (long) failures.push(`talked for ${long.split(/\s+/).length} words in one turn`);
        break;
      }
      case "no_repeated_question": {
        const seen = new Set<string>();
        for (const l of lines.filter((x) => x.endsWith("?"))) {
          const norm = l.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
          if (norm.length >= 16 && seen.has(norm)) {
            failures.push(`asked the same question twice: "${l.slice(0, 100)}"`);
            break;
          }
          seen.add(norm);
        }
        break;
      }
    }
  }
  return failures;
}
