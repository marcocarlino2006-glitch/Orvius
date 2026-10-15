/**
 * The contract a paid voice test must carry before it touches a provider.
 *
 * Real voice tests are off by default. A run needs a separate, explicit
 * authorization written by the person who owns the budget, binding: the exact
 * reviewed commit, the protected environment, the test-only phone resources,
 * a consented destination allowlist, the scenario profile, the caps and budget
 * ceiling they chose, who may abort, how resources are restored, and that the
 * evidence is redacted. Nothing here picks a call count, minute cap or budget;
 * a missing value refuses. A pull request label is never one of the inputs.
 */
import { readFileSync } from "node:fs";

const E164 = /^\+[1-9]\d{7,14}$/;
const SHA = /^[0-9a-f]{40}$/;

function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * @returns {{ ok: true, auth: object } | { ok: false, problems: string[] }}
 */
export function checkVoiceAuthorization(auth, ctx) {
  const problems = [];
  if (!auth || typeof auth !== "object") return { ok: false, problems: ["no authorization was given; paid voice tests are off"] };
  const need = (cond, why) => {
    if (!cond) problems.push(why);
  };
  need(typeof auth.id === "string" && auth.id.trim(), "id: the authorization reference");
  need(typeof auth.approvedBy === "string" && auth.approvedBy.trim(), "approvedBy: the budget owner who authorized this run");
  need(typeof auth.commit === "string" && SHA.test(auth.commit), "commit: the full reviewed commit");
  need(!ctx.headCommit || auth.commit === ctx.headCommit, `commit: this checkout is ${ctx.headCommit?.slice(0, 12)}, not the authorized ${String(auth.commit).slice(0, 12)}`);
  need(typeof auth.environment === "string" && auth.environment === ctx.environment, `environment: the run is in "${ctx.environment ?? "none"}", not the authorized protected environment`);
  need(auth.receptionistPhoneId && auth.receptionistPhoneId === ctx.receptionistPhoneId, "receptionistPhoneId: must name the test-only receptionist number this run uses");
  need(auth.callerPhoneId && auth.callerPhoneId === ctx.callerPhoneId, "callerPhoneId: must name the test-only caller number this run uses");
  const allow = Array.isArray(auth.destinationAllowlist) ? auth.destinationAllowlist : [];
  need(allow.length > 0 && allow.every((n) => E164.test(n)), "destinationAllowlist: consented E.164 numbers");
  need(Array.isArray(auth.scenarioProfile) && auth.scenarioProfile.length > 0, "scenarioProfile: the scenario ids (or \"gate\") this run may place");
  need(Number.isInteger(auth.maxCalls) && auth.maxCalls > 0, "maxCalls: the call cap the budget owner chose");
  need(positive(auth.maxMinutesPerCall), "maxMinutesPerCall: the per-call minute cap the budget owner chose");
  need(positive(auth.budgetUsd), "budgetUsd: the spend ceiling the budget owner chose");
  need(typeof auth.abortOwner === "string" && auth.abortOwner.trim(), "abortOwner: who stops the run");
  need(auth.cleanup === "restore-assistant-and-delete-test-assistant", "cleanup: restore-assistant-and-delete-test-assistant");
  need(auth.evidence === "redacted", "evidence: redacted");
  const expires = Date.parse(auth.expiresAt ?? "");
  need(Number.isFinite(expires) && expires > (ctx.now ?? Date.now()), "expiresAt: a future time");
  if (auth.transfer === true) {
    need(typeof auth.transferAuthorizedBy === "string" && auth.transferAuthorizedBy.trim(), "transferAuthorizedBy: transfer needs its own authorization");
    need(ctx.transferNumber && allow.includes(ctx.transferNumber), "transfer number must be on the destination allowlist");
  } else if (ctx.transferNumber) {
    problems.push("a transfer number is configured but transfer is not authorized; unset VOICE_SIM_TRANSFER_NUMBER");
  }
  return problems.length ? { ok: false, problems } : { ok: true, auth };
}

/** Whether this many planned calls, and this destination, fall inside the authorization. */
export function planWithinAuthorization(auth, { destination, scenarios }) {
  const problems = [];
  if (scenarios.length > auth.maxCalls) problems.push(`the plan places ${scenarios.length} calls; the authorization allows ${auth.maxCalls}`);
  if (!auth.destinationAllowlist.includes(destination)) problems.push(`${destination} is not on the consented destination allowlist`);
  const allowed = new Set(auth.scenarioProfile);
  const outside = scenarios.filter((s) => !allowed.has(s.id) && !(allowed.has("gate") && s.gate)).map((s) => s.id);
  if (outside.length) problems.push(`scenarios outside the authorized profile: ${outside.slice(0, 5).join(", ")}`);
  return problems;
}

/** Read the authorization from VOICE_TEST_AUTHORIZATION (JSON) or VOICE_TEST_AUTHORIZATION_FILE. */
export function loadVoiceAuthorization(env = process.env) {
  const inline = env.VOICE_TEST_AUTHORIZATION?.trim();
  if (inline) return JSON.parse(inline);
  const file = env.VOICE_TEST_AUTHORIZATION_FILE?.trim();
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  return null;
}
