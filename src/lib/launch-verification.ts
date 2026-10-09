import { findAvailableSchedules, fitsShopHours, overlappingJobs } from "@/lib/availability";
import { deriveDemandSignal } from "@/lib/demand-capture";
import { isDemandCategoryCode } from "@/lib/job-taxonomy";
import { leadWantsHuman } from "@/lib/lead-wants-human";
import { buildOwnerLeadAlertMessage, ownerAlertContextLine } from "@/lib/owner-alert-message";
import { alertFailureRecoveryHint } from "@/lib/owner-alerts";
import { rankTechnicians } from "@/lib/technician-match";
import { classifyRequest, skillOptions, TRADE_PLAYBOOKS } from "@/lib/trade-playbooks";
import { outsideScope, TRADE_SCOPES, type TradeScope } from "@/lib/trade-scope";
import { tradePromptPack, type Trade } from "@/lib/trades";

/*
  The launch gate. A trade launches when a business in it can, with no custom
  engineering: configure its work, have requests read correctly, get them
  booked and assigned inside its real hours and team, hear about changes and
  failures, and have anything unsafe or unsupported handed to a person. Each
  check runs the production functions, not a description of them.
*/

export const LAUNCH_CRITERIA = [
  { key: "configure", label: "Configure services and rules without custom engineering", gap: "setting up its services" },
  { key: "receive", label: "Receive and qualify requests correctly", gap: "sorting its calls into job types" },
  { key: "book", label: "Book and assign work within the shop's real constraints", gap: "booking inside its hours and team" },
  { key: "notify", label: "Owner hears about changes and failures", gap: "owner alerts for changes and failures" },
  { key: "escalate", label: "Unsafe or unsupported calls go to a person", gap: "knowing which calls to hand to a person" },
] as const;

/** What a trade on the interest list is still missing, in an owner's words. */
export function launchGaps(result: TradeVerification): string[] {
  return LAUNCH_CRITERIA.filter((c) => result.criteria[c.key].length).map((c) => c.gap);
}

export type CriterionKey = (typeof LAUNCH_CRITERIA)[number]["key"];

export type TradeVerification = {
  trade: Trade;
  passed: boolean;
  criteria: Record<CriterionKey, string[]>;
};

const TIMEZONE = "America/Chicago";
const WEEKDAY = { open: "08:00", close: "17:00" };
const HOURS = JSON.stringify({
  monday: WEEKDAY,
  tuesday: WEEKDAY,
  wednesday: WEEKDAY,
  thursday: WEEKDAY,
  friday: WEEKDAY,
  saturday: { open: "08:00", close: "12:00" },
  sunday: { open: "00:00", close: "00:00", closed: true },
});
/** A Monday at 9:00 in the shop's zone. */
const NOW = new Date("2026-10-05T14:00:00Z");

function checkConfigure(scope: TradeScope, out: string[]) {
  const playbook = TRADE_PLAYBOOKS[scope.trade];
  const skills = new Set(skillOptions(scope.trade).map((s) => s.key));
  if (!tradePromptPack(scope.trade).trim()) out.push("No trade guidance in the receptionist's prompt");
  if (!scope.workflows.length) out.push("No workflows defined");
  for (const w of scope.workflows) {
    for (const key of w.services) {
      const service = playbook.services.find((s) => s.key === key);
      if (!service) out.push(`${w.label}: books as "${key}", which the playbook doesn't have`);
      else if (service.skill !== "general" && !skills.has(service.skill)) out.push(`${w.label}: technicians can't be tagged with "${service.skill}"`);
    }
  }
  const first = scope.workflows[0];
  const service = first && playbook.services.find((s) => s.key === first.services[0]);
  if (first && service) {
    const custom = classifyRequest({
      business: { trade: scope.trade, servicesJson: JSON.stringify([{ name: service.label, durationMin: 45, skill: "lead_tech" }]) },
      serviceType: first.calls[0]?.says,
    });
    if (custom.service.durationMin !== 45 || custom.service.skill !== "lead_tech") {
      out.push(`${first.label}: a shop's own duration and skill for the service are ignored`);
    }
  }
}

function checkReceive(scope: TradeScope, out: string[]) {
  for (const w of scope.workflows) {
    if (!w.categories.length) {
      out.push(`${w.label}: no demand category, so requests without an address aren't qualified and aren't counted on the board or in reports`);
    }
    for (const call of w.calls) {
      const read = classifyRequest({ business: { trade: scope.trade }, serviceType: call.says, callerWords: call.says });
      if (!w.services.includes(read.service.key)) out.push(`"${call.says}" read as ${read.service.label}, not ${w.label}`);
      if (read.safety) out.push(`"${call.says}" was treated as a safety call (${read.safety.label})`);
      if (call.urgency && read.urgency !== call.urgency) out.push(`"${call.says}" urgency read as ${read.urgency ?? "none"}, expected ${call.urgency}`);
      if (!call.urgency && read.urgency === "emergency") out.push(`"${call.says}" was escalated as an emergency`);
      const category = deriveDemandSignal({ serviceType: call.says, trade: scope.trade }).categoryCode;
      if (w.categories.length && !w.categories.includes(category ?? "")) {
        out.push(`"${call.says}" recorded as ${category ?? "no category"}, expected ${w.categories.join(" or ")}`);
      }
      if (outsideScope(scope.trade, call.says)) out.push(`"${call.says}" is supported work but was marked out of scope`);
    }
  }
  for (const code of scope.workflows.flatMap((w) => w.categories)) {
    if (!isDemandCategoryCode(code)) out.push(`Demand category "${code}" doesn't exist`);
  }
}

function checkBook(scope: TradeScope, out: string[]) {
  for (const w of scope.workflows) {
    const call = w.calls[0];
    if (!call) continue;
    const read = classifyRequest({ business: { trade: scope.trade }, serviceType: call.says });
    const durationMin = read.service.durationMin;
    const shop = { now: NOW, urgency: read.urgency, hoursJson: HOURS, timezone: TIMEZONE, capacity: 1, durationMin };
    const [first] = findAvailableSchedules({ ...shop, existing: [] }, { count: 1 });
    if (!first) {
      out.push(`${w.label}: no window found in two weeks of normal shop hours`);
      continue;
    }
    if (!fitsShopHours({ start: first, durationMin, hoursJson: HOURS, timezone: TIMEZONE })) {
      out.push(`${w.label}: offered a window that runs past closing`);
    }
    const existing = [{ scheduledAt: first, durationMin }];
    const [next] = findAvailableSchedules({ ...shop, existing }, { count: 1 });
    if (!next || overlappingJobs({ start: next, durationMin, existing }) > 0) {
      out.push(`${w.label}: a one-technician shop was double-booked`);
    }

    const skill = read.service.skill;
    const specialist = { id: "a", name: "Avery", skills: [skill], jobs: [] };
    const other = { id: "b", name: "Blake", skills: ["unrelated_skill"], jobs: [] };
    const ranked = rankTechnicians({ candidates: [other, specialist], scheduledAt: first, durationMin, skill, timezone: TIMEZONE });
    if (ranked.pick?.technicianId !== "a") out.push(`${w.label}: not assigned to the technician with the ${skill} skill`);
    if (skill !== "general") {
      const nobody = rankTechnicians({ candidates: [other], scheduledAt: first, durationMin, skill, timezone: TIMEZONE });
      if (nobody.pick || !nobody.blocked) out.push(`${w.label}: assigned to a technician without the ${skill} skill`);
    }
    const busy = rankTechnicians({
      candidates: [{ ...specialist, jobs: [{ id: "j", scheduledAt: first, durationMin }] }],
      scheduledAt: first,
      durationMin,
      skill,
      timezone: TIMEZONE,
    });
    if (busy.pick) out.push(`${w.label}: assigned to a technician already on another job`);
  }
}

function checkNotify(scope: TradeScope, out: string[]) {
  for (const w of scope.workflows) {
    const at = new Date(NOW.getTime() + 24 * 3_600_000);
    const lead = { name: "Dana Ruiz", phone: "+15125550100", serviceType: w.label, urgency: w.calls[0]?.urgency ?? null };
    const booked = buildOwnerLeadAlertMessage({ lead, job: { scheduledAt: at }, autoBooked: true, timezone: TIMEZONE });
    if (!booked.includes(w.label) || !booked.includes("Proposed window")) out.push(`${w.label}: the owner's text doesn't say what was booked and when`);
    const existingJob = { title: w.label, scheduledAt: at };
    const moved = ownerAlertContextLine({ skipReason: "existing_job", intent: "reschedule", existingJob, timezone: TIMEZONE });
    if (!moved?.includes(w.label) || !moved.includes("Not moved yet")) out.push(`${w.label}: a reschedule request doesn't reach the owner clearly`);
    const cancelled = ownerAlertContextLine({ skipReason: "existing_job", intent: "cancel", existingJob, timezone: TIMEZONE });
    if (!cancelled?.includes("Not cancelled yet")) out.push(`${w.label}: a cancellation doesn't reach the owner clearly`);
  }
  for (const reason of ["capacity_unavailable", "held_slot_taken", "missing_address", "outside_scope"]) {
    if (!ownerAlertContextLine({ skipReason: reason, timezone: TIMEZONE })) out.push(`The owner isn't told when a booking fails (${reason})`);
  }
  if (!alertFailureRecoveryHint("21614 not a mobile number", "sms")) out.push("A failed owner text has no recovery step");
}

function checkEscalate(scope: TradeScope, out: string[]) {
  if (!scope.hazards.length) out.push("No safety rules: nothing tells Orvius which calls must go to a person");
  for (const h of scope.hazards) {
    const read = classifyRequest({ business: { trade: scope.trade }, serviceType: h.says, callerWords: h.says });
    if (read.safety?.key !== h.safety) out.push(`"${h.says}" wasn't escalated as ${h.safety} (got ${read.safety?.key ?? "nothing"})`);
    else if (read.urgency !== "emergency") out.push(`"${h.says}" was escalated but not marked emergency`);
  }
  if (!scope.notCovered.length) out.push("No out-of-scope work defined, so unsupported requests would be booked as if they were supported");
  for (const n of scope.notCovered) {
    if (outsideScope(scope.trade, n.says)?.key !== n.key) out.push(`"${n.says}" would be booked instead of going to the owner`);
  }
  if (!leadWantsHuman({ notes: "Caller asked to talk to a real person" })) out.push("A caller asking for a person isn't flagged");
}

export function verifyTrade(scope: TradeScope): TradeVerification {
  const criteria = { configure: [], receive: [], book: [], notify: [], escalate: [] } as Record<CriterionKey, string[]>;
  checkConfigure(scope, criteria.configure);
  checkReceive(scope, criteria.receive);
  checkBook(scope, criteria.book);
  checkNotify(scope, criteria.notify);
  checkEscalate(scope, criteria.escalate);
  return { trade: scope.trade, passed: Object.values(criteria).every((f) => !f.length), criteria };
}

export function verifyAllTrades(): TradeVerification[] {
  return TRADE_SCOPES.map(verifyTrade);
}

export function verifiedTrades(): Trade[] {
  return verifyAllTrades().filter((v) => v.passed).map((v) => v.trade);
}
