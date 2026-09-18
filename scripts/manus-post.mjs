#!/usr/bin/env node
/**
 * Manus post runbook — ordered close sequence + current reds.
 * Does not invent secrets. After every paste: npm run manus:post
 *
 * Steps live in src/lib/manus-post.ts — single source of truth.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MANUS_POST_STEPS,
  MANUS_ALLOWED_FIRST_POST,
  MANUS_FORBIDDEN_CLAIMS,
  claimsViolateManusPost,
  probeManusEnvSecrets,
  resolveManusPostNext,
} from "../src/lib/manus-post.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

const fileEnv = loadEnv();
const env = { ...fileEnv, ...process.env };

function formationOk() {
  try {
    const src = readFileSync(join(root, "src/lib/company.ts"), "utf8");
    return /formationStateConfirmed:\s*"/.test(src);
  } catch {
    return false;
  }
}

console.log("\n◆ Manus post bar — ordered close sequence\n");
console.log("  Exit 0 on npm run bulletproof = allowed to post.\n");

const secrets = probeManusEnvSecrets(env);
const statusById = {
  telephony: secrets.telephony,
  wedge_line: null,
  wedge_verify: null,
  wedge_alert: null,
  phone_cert: null,
  proof_video: null,
  stripe_key: secrets.stripe_key,
  stripe_setup: secrets.stripe_setup,
  stripe_webhook: secrets.stripe_webhook,
  formation: formationOk(),
  bulletproof_green: null,
};

const wedge = spawnSync("npm", ["run", "wedge:ready"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
const wedgeOut = `${wedge.stdout ?? ""}${wedge.stderr ?? ""}`;
statusById.wedge_line = /✅ Dedicated shop line/.test(wedgeOut)
  ? true
  : /❌ Dedicated shop line/.test(wedgeOut)
    ? false
    : null;
statusById.wedge_verify = /✅ Line tested end-to-end/.test(wedgeOut)
  ? true
  : /❌ Line tested end-to-end/.test(wedgeOut)
    ? false
    : null;
statusById.wedge_alert = /✅ Owner alert delivered/.test(wedgeOut)
  ? true
  : /❌ Owner alert delivered/.test(wedgeOut)
    ? false
    : null;

for (const step of MANUS_POST_STEPS) {
  const st = statusById[step.id];
  let mark = "⬜";
  if (st === true) mark = "✅";
  else if (st === false) mark = "❌";
  console.log(`${mark} ${step.order}. ${step.title}`);
  console.log(`   ${step.action}`);
  if (step.command) console.log(`   cmd: ${step.command}`);
}

const next = resolveManusPostNext(statusById);

console.log("\n─────────────────────────────────────");
if (!next) {
  console.log(
    "Env + wedge probes green — run npm run bulletproof for the final Manus clear.\n",
  );
} else {
  console.log(`▶ NEXT: ${next.order}. ${next.title}`);
  console.log(`  ${next.action}`);
  if (next.command) console.log(`  ${next.command}`);
  console.log("");
}

const postHits = claimsViolateManusPost(MANUS_ALLOWED_FIRST_POST);
if (postHits.length > 0) {
  console.log(`❌ Allowed first post contains forbidden claims: ${postHits.join(", ")}\n`);
  process.exit(1);
}

console.log("Allowed first post (only after bulletproof exits 0):\n");
console.log(
  MANUS_ALLOWED_FIRST_POST.split("\n")
    .map((l) => `  ${l}`)
    .join("\n"),
);
console.log(
  `\nForbidden: ${MANUS_FORBIDDEN_CLAIMS.slice(0, 5).join(" · ")} · …\n`,
);

process.exit(next ? 1 : 0);
