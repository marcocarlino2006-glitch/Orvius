import { isLeadQualifiedForBooking } from "@/lib/auto-job";
import { leadIsNotAJob } from "@/lib/lead-not-a-job";
import { parseTranscript } from "@/lib/transcript";
import { classifyRequest } from "@/lib/trade-playbooks";
import { isEmergency } from "@/lib/urgency";

/**
 * Call quality review. Every answered call is graded on what a shop owner
 * would check if they listened to it: did Orvius get what the tech needs,
 * handle a hazard safely, reach an outcome, and do it without making the
 * caller fight it. Heuristic and explainable on purpose — each finding names
 * the line that triggered it, so an owner can check it in the recording.
 */

export type CallFinding = {
  key:
    | "not_connected"
    | "hung_up"
    | "missing_capture"
    | "safety_not_emergency"
    | "safety_no_guidance"
    | "safety_unverified"
    | "not_booked"
    | "repeated_self"
    | "asked_for_person"
    | "dead_air"
    | "corrected_orvius"
    | "frustrated"
    | "asked_twice"
    | "stacked_questions"
    | "long_reply"
    | "no_transcript"
    | "low_self_rating";
  /** One sentence, written for the owner. */
  label: string;
  /** fix = something went wrong for the caller; watch = worth a listen. */
  severity: "fix" | "watch";
  /** The caller's or Orvius's own words, when a line triggered it. */
  quote?: string;
};

export type CallVerdict = "clean" | "listen" | "fix";

export type CallGrade = {
  score: number;
  verdict: CallVerdict;
  headline: string;
  captured: string[];
  missing: string[];
  findings: CallFinding[];
};

export type CallGradeInput = {
  call: {
    status: string;
    durationSec: number | null;
    transcript: string | null;
    summary: string | null;
    booked: boolean;
    successEvaluation?: string | null;
  };
  lead: {
    name: string | null;
    phone: string | null;
    address: string | null;
    serviceType: string | null;
    urgency: string | null;
    categoryCode?: string | null;
    notes?: string | null;
    status?: string | null;
    job?: { id: string } | null;
  } | null;
  business?: { trade?: string | null; servicesJson?: string | null; name?: string | null };
  /** A returning customer's address on file — not a capture miss if the call skipped it. */
  knownAddress?: string | null;
};

const REPEATED =
  /\b(i )?(already|just) (said|told you|gave you|mentioned)\b|\blike i said\b|\bi said that\b/i;
const ASKED_FOR_PERSON =
  /\b(speak|talk) (to|with) (a |an )?(real |live |actual )?(person|human|someone|somebody|owner|manager|technician)\b|\b(are you|is this) (a |an )?(robot|machine|real person|bot|ai|recording)\b|\b(representative|operator)\b|\breal person\b/i;
const DEAD_AIR = /^(hello\?+|hello, ?hello|can you hear me|are you (still )?there|anyone there)/i;
const CORRECTED =
  /\bthat'?s not what i (said|meant)\b|\bno,? i said\b|\byou (got|have) (it|that) wrong\b|\bthat'?s (wrong|not right|incorrect)\b|\bwrong (address|number|name|day|time)\b/i;
const FRUSTRATED =
  /\b(ridiculous|frustrat\w*|annoying|useless|forget it|never ?mind|this is stupid|waste of (my )?time)\b/i;
/** What a receptionist says to someone reporting a hazard. */
const SAFETY_GUIDANCE =
  /\b911\b|leave (the|your) (house|home|building)|get (everyone )?out(side)?|step outside|shut (it |the \w+ )?off|turn (it |the \w+ )?off|breaker|gas (company|utility)|stay away|don'?t (touch|use|flip|light)|evacuat/i;

/** The opening line plus the recording disclosure legitimately runs long. */
const DISCLOSURE = /\brecorded\b/i;
const LONG_REPLY_WORDS = 45;

/** Transcribers turn "Got it." into "Got it?", so a question needs three words to count. */
function questionCount(text: string) {
  return (text.match(/[^.?!]+\?/g) ?? []).filter((q) => q.trim().split(/\s+/).length >= 3).length;
}

function usablePhone(phone: string | null | undefined) {
  return (phone ?? "").replace(/\D/g, "").length >= 10;
}

function clip(text: string, max = 120) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const PENALTY: Record<CallFinding["key"], number> = {
  not_connected: 60,
  hung_up: 15,
  missing_capture: 0,
  safety_not_emergency: 35,
  safety_no_guidance: 40,
  safety_unverified: 10,
  not_booked: 15,
  repeated_self: 10,
  asked_for_person: 10,
  dead_air: 10,
  corrected_orvius: 12,
  frustrated: 15,
  asked_twice: 8,
  stacked_questions: 5,
  long_reply: 5,
  no_transcript: 10,
  low_self_rating: 10,
};

export function gradeCall(input: CallGradeInput): CallGrade {
  const { call, lead } = input;
  const lines = parseTranscript(call.transcript);
  const callerLines = lines.filter((l) => l.role === "caller");
  const aiLines = lines.filter((l) => l.role === "ai");
  const findings: CallFinding[] = [];
  const captured: string[] = [];
  const missing: string[] = [];
  let capturePenalty = 0;

  const status = call.status.trim().toLowerCase();
  if (status === "failed" || status === "busy" || status === "no-answer") {
    findings.push({ key: "not_connected", label: "The call did not connect, so nobody spoke to the caller.", severity: "fix" });
  }
  const live = status === "in-progress" || status === "ringing";

  const notAJob = lead ? leadIsNotAJob(lead) : false;
  const problem = Boolean(lead?.serviceType?.trim() || (lead?.categoryCode && !lead.categoryCode.startsWith("other.")));

  if (!findings.length && !live && !notAJob) {
    const shortCall = call.durationSec != null && call.durationSec < 20;
    if (shortCall && !problem) {
      findings.push({ key: "hung_up", label: "The caller hung up before saying what they needed.", severity: "watch" });
    } else if (lead) {
      const fields: Array<[string, boolean, number]> = [
        ["name", Boolean(lead.name?.trim()), 8],
        ["callback number", usablePhone(lead.phone), 15],
        ["problem", problem, 12],
        [
          lead.address?.trim() || !input.knownAddress?.trim() ? "address" : "address on file",
          Boolean(lead.address?.trim() || input.knownAddress?.trim()),
          10,
        ],
        ["urgency", Boolean(lead.urgency?.trim()), 5],
      ];
      for (const [label, ok, weight] of fields) {
        if (ok) captured.push(label);
        else {
          missing.push(label);
          capturePenalty += weight;
        }
      }
      if (missing.length) {
        findings.push({
          key: "missing_capture",
          label: `Orvius did not get the caller's ${list(missing)}.`,
          severity: missing.includes("callback number") || missing.includes("problem") ? "fix" : "watch",
        });
      }
    }
  }

  const callerWords = callerLines.map((l) => l.text).join(" \n ");
  const hazardText = [callerWords, call.summary, lead?.serviceType, lead?.notes].filter(Boolean).join(" \n ");
  const hazard = hazardText
    ? classifyRequest({ business: input.business ?? {}, serviceType: hazardText }).safety
    : null;
  const gaveGuidance = aiLines.some((l) => SAFETY_GUIDANCE.test(l.text));
  if (hazard) {
    captured.push(`safety: ${hazard.label.toLowerCase()}`);
    if (lead && !isEmergency(lead.urgency)) {
      findings.push({
        key: "safety_not_emergency",
        label: `The caller reported ${hazard.label.toLowerCase()}, but the lead was not marked an emergency.`,
        severity: "fix",
      });
    }
    if (aiLines.length && !gaveGuidance) {
      const trigger = callerLines.find((l) =>
        classifyRequest({ business: input.business ?? {}, serviceType: l.text }).safety,
      );
      findings.push({
        key: "safety_no_guidance",
        label: `The caller reported ${hazard.label.toLowerCase()} and Orvius never told them how to stay safe.`,
        severity: "fix",
        quote: trigger ? clip(trigger.text) : undefined,
      });
    }
    if (!aiLines.length && !live && status !== "failed") {
      findings.push({
        key: "safety_unverified",
        label: `The caller reported ${hazard.label.toLowerCase()}, and the transcript does not show what Orvius told them. Listen to confirm they got safety steps.`,
        severity: "watch",
      });
    }
  }

  const booked = call.booked || Boolean(lead?.job);
  if (booked) captured.push("booked");
  if (
    lead &&
    !booked &&
    !hazard &&
    !notAJob &&
    !live &&
    (lead.status ?? "new") === "new" &&
    Boolean(lead.address?.trim()) &&
    isLeadQualifiedForBooking(lead)
  ) {
    findings.push({
      key: "not_booked",
      label: "Orvius had what it needed to book this but no job was created.",
      severity: "watch",
    });
  }

  const friction: Array<[CallFinding["key"], RegExp, string]> = [
    ["repeated_self", REPEATED, "The caller had to repeat themselves."],
    ["asked_for_person", ASKED_FOR_PERSON, "The caller asked for a person."],
    ["corrected_orvius", CORRECTED, "The caller corrected something Orvius got wrong."],
    ["frustrated", FRUSTRATED, "The caller sounded frustrated."],
  ];
  for (const [key, pattern, label] of friction) {
    const hit = callerLines.find((l) => pattern.test(l.text));
    if (hit) findings.push({ key, label, severity: "watch", quote: clip(hit.text) });
  }
  const deadAir = callerLines.slice(1).find((l) => DEAD_AIR.test(l.text));
  if (deadAir) {
    findings.push({
      key: "dead_air",
      label: "The caller could not tell whether anyone was on the line.",
      severity: "watch",
      quote: clip(deadAir.text),
    });
  }
  const seen = new Map<string, string>();
  for (const line of aiLines) {
    const norm = line.text.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    if (norm.length < 16 || !norm.includes(" ")) continue;
    if (seen.has(norm) && /\?$/.test(line.text.trim())) {
      findings.push({ key: "asked_twice", label: "Orvius asked the caller the same question twice.", severity: "watch", quote: clip(line.text) });
      break;
    }
    seen.set(norm, line.text);
  }

  const stacked = aiLines.find((l) => questionCount(l.text) >= 2);
  if (stacked) {
    findings.push({
      key: "stacked_questions",
      label: "Orvius asked more than one question at once.",
      severity: "watch",
      quote: clip(stacked.text),
    });
  }
  const long = aiLines.find(
    (l) => l.text.trim().split(/\s+/).length > LONG_REPLY_WORDS && !SAFETY_GUIDANCE.test(l.text) && !DISCLOSURE.test(l.text),
  );
  if (long) {
    findings.push({
      key: "long_reply",
      label: "Orvius talked for too long in one turn.",
      severity: "watch",
      quote: clip(long.text),
    });
  }

  if (!live && status !== "failed" && !call.transcript?.trim() && (call.durationSec ?? 0) >= 20) {
    findings.push({ key: "no_transcript", label: "No transcript was saved, so this call cannot be reviewed from text.", severity: "watch" });
  }

  const rating = Number(call.successEvaluation);
  if (call.successEvaluation != null && Number.isFinite(rating) && rating > 0 && rating <= 5) {
    findings.push({ key: "low_self_rating", label: `The voice agent scored its own call ${rating}/10.`, severity: "watch" });
  }

  const penalty = capturePenalty + findings.reduce((sum, f) => sum + PENALTY[f.key], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const verdict: CallVerdict = findings.some((f) => f.severity === "fix")
    ? "fix"
    : findings.length
      ? "listen"
      : "clean";

  const weight = (f: CallFinding) => (f.key === "missing_capture" ? capturePenalty : PENALTY[f.key]);
  const ordered = [...findings].sort(
    (a, b) => (a.severity === b.severity ? weight(b) - weight(a) : a.severity === "fix" ? -1 : 1),
  );

  let headline: string;
  if (ordered[0]) headline = ordered[0].label;
  else if (live) headline = "The call is still in progress.";
  else if (notAJob) headline = "Not a job for this shop. Orvius handled it without the owner.";
  else if (booked) headline = "Clean call. Orvius got everything the tech needs and booked it.";
  else if (hazard && gaveGuidance) headline = `Clean call. Orvius treated ${hazard.label.toLowerCase()} as an emergency and told the caller how to stay safe.`;
  else headline = "Clean call. Orvius got everything the tech needs.";

  return { score, verdict, headline, captured, missing, findings: ordered };
}

export type CallQualitySummary = {
  graded: number;
  clean: number;
  listen: number;
  fix: number;
  /** Most common problem topics across the calls, most frequent first. */
  top: Array<{ key: CallFinding["key"]; label: string; count: number }>;
};

const TOPIC: Record<CallFinding["key"], string> = {
  not_connected: "calls that did not connect",
  hung_up: "hang-ups",
  missing_capture: "missed caller details",
  safety_not_emergency: "hazards not marked emergency",
  safety_no_guidance: "hazards without safety guidance",
  safety_unverified: "hazards to listen to",
  not_booked: "bookable calls left unbooked",
  repeated_self: "callers repeating themselves",
  asked_for_person: "callers asking for a person",
  dead_air: "dead air",
  corrected_orvius: "callers correcting Orvius",
  frustrated: "frustrated callers",
  asked_twice: "repeated questions",
  stacked_questions: "several questions at once",
  long_reply: "long replies",
  no_transcript: "missing transcripts",
  low_self_rating: "low voice-agent scores",
};

export function summarizeCallQuality(grades: CallGrade[]): CallQualitySummary {
  const counts = new Map<CallFinding["key"], { label: string; count: number }>();
  for (const grade of grades) {
    for (const f of grade.findings) {
      const entry = counts.get(f.key) ?? { label: TOPIC[f.key], count: 0 };
      entry.count += 1;
      counts.set(f.key, entry);
    }
  }
  return {
    graded: grades.length,
    clean: grades.filter((g) => g.verdict === "clean").length,
    listen: grades.filter((g) => g.verdict === "listen").length,
    fix: grades.filter((g) => g.verdict === "fix").length,
    top: [...counts.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3),
  };
}
