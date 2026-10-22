#!/usr/bin/env node
/**
 * Call one effectful scheduled sweep (alert-drain, line-watch) on an explicitly
 * named deployment, never a default one.
 *
 * Before the sweep is requested it needs, from the environment:
 *   DRAIN_TARGET_URL        the deployment base URL, listed in ops/drain-targets.json
 *   DRAIN_TARGET_ENV        the environment that URL is listed under (production, preview, staging)
 *   DRAIN_EXPECTED_RELEASE  the full approved release commit
 *   CRON_SECRET             the sweep credential
 * It then reads the deployment's public /api/health and refuses unless the
 * deployment names that environment and that commit. Only then is the sweep
 * requested, carrying the same target and release so the server checks them
 * again before doing anything. Any mismatch exits non-zero with no sweep request.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const SWEEPS = new Set(["alert-drain", "line-watch"]);
export const DRAIN_TARGETS_FILE = "ops/drain-targets.json";

export function readDrainTargets(path = resolve(root, DRAIN_TARGETS_FILE)) {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
}

/**
 * The deployment a release step may talk to. Decided from the environment
 * alone, before any request: one listed host, one environment, one full
 * commit, and the cron credential. No default target.
 */
export function releaseTargetPlan(env, targets) {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) return { ok: false, reason: "CRON_SECRET is not set" };
  const target = env.DRAIN_TARGET_ENV?.trim();
  if (!["production", "preview", "staging"].includes(target ?? "")) return { ok: false, reason: "DRAIN_TARGET_ENV must be production, preview or staging" };
  const raw = env.DRAIN_TARGET_URL?.trim();
  if (!raw) return { ok: false, reason: "DRAIN_TARGET_URL is not set; there is no default target" };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "DRAIN_TARGET_URL is not a URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "DRAIN_TARGET_URL must be https" };
  const listed = targets?.[target] ?? [];
  if (!listed.includes(url.host)) return { ok: false, reason: `${url.host} is not listed for ${target} in ${DRAIN_TARGETS_FILE}` };
  for (const [other, hosts] of Object.entries(targets ?? {})) {
    if (other !== target && hosts.includes(url.host)) return { ok: false, reason: `${url.host} is also listed for ${other}` };
  }
  const release = env.DRAIN_EXPECTED_RELEASE?.trim().toLowerCase();
  if (!release || !/^[0-9a-f]{40}$/.test(release)) return { ok: false, reason: "DRAIN_EXPECTED_RELEASE must be the full approved release commit" };
  return { ok: true, base: url.origin, target, release, secret };
}

/** Decide from the environment alone, before any request. */
export function drainPlan(sweep, env, targets) {
  if (!SWEEPS.has(sweep)) return { ok: false, reason: `unknown sweep ${sweep}` };
  return releaseTargetPlan(env, targets);
}

export async function runScheduledDrain(sweep, { env = process.env, targets = readDrainTargets(), fetchImpl = fetch, timeoutMs = 60_000 } = {}) {
  const plan = drainPlan(sweep, env, targets);
  if (!plan.ok) return { ok: false, stage: "plan", reason: plan.reason };
  let health;
  try {
    const res = await fetchImpl(`${plan.base}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    health = res.ok ? await res.json() : null;
  } catch {
    health = null;
  }
  const served = health?.release;
  if (!served) return { ok: false, stage: "identity", reason: "the deployment did not report its release; nothing was requested" };
  if (served.environment !== plan.target) return { ok: false, stage: "identity", reason: `the deployment is ${served.environment}, not ${plan.target}` };
  if (served.commit !== plan.release) return { ok: false, stage: "identity", reason: `the deployment serves ${served.commit ?? "an unnamed build"}, not the approved ${plan.release}` };
  const res = await fetchImpl(`${plan.base}/api/cron/${sweep}`, {
    method: "GET",
    redirect: "manual",
    headers: { authorization: `Bearer ${plan.secret}`, "x-orvius-target": plan.target, "x-orvius-release": plan.release },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.text();
  return { ok: res.ok, stage: "sweep", status: res.status, body: body.slice(0, 2000) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [sweep, seconds] = process.argv.slice(2);
  runScheduledDrain(sweep, { timeoutMs: (Number(seconds) || 60) * 1000 })
    .then((r) => {
      if (r.body) console.log(r.body);
      if (!r.ok) {
        console.error(`::error::${sweep} not run: ${r.reason ?? `status ${r.status}`}`);
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error(`::error::${sweep} failed: ${error instanceof Error ? error.message : error}`);
      process.exit(1);
    });
}
