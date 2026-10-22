#!/usr/bin/env node
/**
 * Take a restore-drilled backup of the named deployment, then create JobBilling
 * there. Refuses before either request unless the deployment's /api/health
 * reports the environment and commit this run was given. The SQL stays on the
 * server; this sends the checksum of the statements in this checkout.
 *
 *   DRAIN_TARGET_URL, DRAIN_TARGET_ENV, DRAIN_EXPECTED_RELEASE, CRON_SECRET
 *   MIGRATION_APPROVAL, MIGRATION_BACKUP_REF
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { jobBillingPlanSha256 } from "../src/lib/job-billing-schema.ts";
import { readDrainTargets, releaseTargetPlan } from "./scheduled-drain.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function readHealth(fetchImpl, base) {
  try {
    const res = await fetchImpl(`${base}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return (await res.json())?.release ?? null;
  } catch {
    return null;
  }
}

/**
 * Wait until the named deployment is serving this release, save the encrypted
 * backup, then ask it to create JobBilling. A wrong or unnamed deployment
 * gets neither request.
 */
export async function applyJobBillingRelease({
  env = process.env,
  targets = readDrainTargets(),
  fetchImpl = fetch,
  writeFile,
  now = Date.now,
  sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
  deadlineMs = 8 * 60 * 1000,
  pollMs = 15_000,
} = {}) {
  const plan = releaseTargetPlan(env, targets);
  if (!plan.ok) return { ok: false, stage: "plan", reason: plan.reason };
  const approval = env.MIGRATION_APPROVAL?.trim();
  const backupRef = env.MIGRATION_BACKUP_REF?.trim();
  if (!approval) return { ok: false, stage: "plan", reason: "MIGRATION_APPROVAL is not set" };
  if (!backupRef) return { ok: false, stage: "plan", reason: "MIGRATION_BACKUP_REF is not set" };
  if (!writeFile) return { ok: false, stage: "plan", reason: "no file was named for the backup" };

  const started = now();
  let served = null;
  for (;;) {
    served = await readHealth(fetchImpl, plan.base);
    if (served?.environment === plan.target && served?.commit === plan.release) break;
    if (now() - started >= deadlineMs) {
      const reason = !served
        ? "the deployment did not report its release; nothing was requested"
        : served.environment !== plan.target
          ? `the deployment is ${served.environment}, not ${plan.target}`
          : `the deployment serves ${served.commit ?? "an unnamed build"}, not the approved ${plan.release}`;
      return { ok: false, stage: "identity", reason };
    }
    await sleep(pollMs);
  }

  const headers = {
    authorization: `Bearer ${plan.secret}`,
    "x-orvius-target": plan.target,
    "x-orvius-release": plan.release,
  };
  const backup = await fetchImpl(`${plan.base}/api/cron/backup`, {
    method: "GET",
    redirect: "manual",
    headers,
    signal: AbortSignal.timeout(90_000),
  });
  const drill = backup.headers?.get?.("x-orvius-backup") ?? "";
  if (!backup.ok || !drill.includes("restored=ok")) {
    const body = await backup.text();
    return { ok: false, stage: "backup", status: backup.status, reason: drill || body.slice(0, 300) };
  }
  const bytes = Buffer.from(await backup.arrayBuffer());
  if (bytes.length < 16) return { ok: false, stage: "backup", reason: "the backup response was empty" };
  writeFile(bytes);

  const applied = await fetchImpl(`${plan.base}/api/cron/job-billing-schema`, {
    method: "POST",
    redirect: "manual",
    headers: {
      ...headers,
      "x-orvius-approval": approval,
      "x-orvius-backup-ref": backupRef,
      "x-orvius-plan-sha256": jobBillingPlanSha256(),
    },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await applied.text();
  if (!applied.ok) return { ok: false, stage: "schema", status: applied.status, body: body.slice(0, 500) };
  return { ok: true, stage: "schema", bytes: bytes.length, body: body.slice(0, 500) };
}

async function main() {
  const out = resolve(root, "encrypted", `job-billing-${new Date().toISOString().replace(/[:.]/g, "-")}.json.enc`);
  mkdirSync(dirname(out), { recursive: true });
  const result = await applyJobBillingRelease({
    writeFile: (bytes) => writeFileSync(out, bytes, { mode: 0o600 }),
  });
  if (result.body) console.log(result.body);
  if (!result.ok) {
    console.error(`::error::JobBilling schema not applied: ${result.reason ?? `status ${result.status}`}`);
    process.exit(1);
  }
  console.log(`Backup ${result.bytes} bytes → ${out}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
