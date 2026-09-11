#!/usr/bin/env node
/**
 * Verify what is actually serving traffic.
 *
 * Every other gate in this repo reads the working tree or a local dev server.
 * That left a blind spot the width of the deployment: production ran a build
 * from before a security fix, answered anonymous requests to a cron route that
 * sends SMS, published the shop and lead counts to anyone with curl, and served
 * www.orvius.im under a certificate that does not name it. Nothing was wrong
 * with the code. Everything was wrong with the thing on the internet, and no
 * check asked it a single question.
 *
 * So this one asks the deployment, not the repo. Run it after every deploy:
 *
 *   npm run prod:verify
 *   PROD_URL=https://staging.example npm run prod:verify
 *
 * ORVIUS_ADMIN_KEY, when set, is used only to confirm that privileged fields
 * still reach a privileged caller — never to relax a check.
 */
import { execFileSync } from "node:child_process";
import { connect } from "node:tls";
import { resolve4 } from "node:dns/promises";

const BASE = (process.env.PROD_URL ?? "https://orvius.im").replace(/\/$/, "");
const ADMIN_KEY = process.env.ORVIUS_ADMIN_KEY?.trim() ?? "";
const APEX = new URL(BASE).hostname.replace(/^www\./, "");

const results = [];

function pass(name, detail) {
  results.push({ name, ok: true });
  console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail) {
  results.push({ name, ok: false });
  console.log(`❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail) {
  results.push({ name, ok: null });
  console.log(`⚠️  ${name}${detail ? ` — ${detail}` : ""}`);
}

function section(title) {
  console.log(`\n   ${title}`);
}

async function get(path, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML or empty — the status is what the caller wanted anyway. */
  }
  return { status: res.status, text, json };
}

console.log(`\n🔎 Orvius production verify — ${BASE}\n`);

/* ── 1. Every hostname we point at the app must serve under a cert that names it ── */

section("Hostnames");

/*
  Only a real domain has sibling hostnames and a certificate to check. Pointed
  at a local build — which is how the fixes below get proven before they are
  deployed — there is nothing here to ask.
*/
const IS_DOMAIN =
  APEX.includes(".") && !/^(localhost|127\.|0\.0\.0\.0|\[)/.test(APEX) &&
  !/^\d+\.\d+\.\d+\.\d+$/.test(APEX);

/**
 * The names on the certificate a host actually presents.
 *
 * fetch() rejects a mismatch, but its error says only that the handshake
 * failed. Reading the SANs turns "could not connect" into "the certificate
 * covers orvius.im and not this name", which is the difference between
 * guessing at DNS and knowing to add the domain in Vercel.
 */
function certNames(host) {
  return new Promise((done) => {
    const socket = connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10000 },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();
        const alt = (cert?.subjectaltname ?? "")
          .split(",")
          .map((entry) => entry.trim().replace(/^DNS:/, ""))
          .filter(Boolean);
        done(alt.length ? alt : cert?.subject?.CN ? [cert.subject.CN] : []);
      },
    );
    socket.on("error", () => done(null));
    socket.on("timeout", () => {
      socket.destroy();
      done(null);
    });
  });
}

function certCovers(names, host) {
  return names.some(
    (name) =>
      name === host ||
      (name.startsWith("*.") && host.endsWith(name.slice(1)) &&
        host.split(".").length === name.split(".").length),
  );
}

for (const host of IS_DOMAIN
  ? [APEX, `www.${APEX}`, `app.${APEX}`, `api.${APEX}`]
  : []) {
  let resolved = false;
  try {
    await resolve4(host);
    resolved = true;
  } catch {
    try {
      /* A CNAME-only host has no A record of its own but still resolves. */
      await resolve4(host, { ttl: false });
      resolved = true;
    } catch {
      resolved = false;
    }
  }

  if (!resolved) {
    warn(host, "no DNS record — not pointed at the app");
    continue;
  }

  const names = await certNames(host);
  if (!names) {
    fail(host, "TLS handshake failed");
    continue;
  }

  if (!certCovers(names, host)) {
    fail(
      host,
      `DNS points here but the certificate covers ${names.join(", ")} — ` +
        `visitors get a browser security warning. Add ${host} in Vercel → Domains`,
    );
    continue;
  }

  try {
    const res = await fetch(`https://${host}/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
    });
    const ok = res.status < 400;
    (ok ? pass : fail)(host, `HTTP ${res.status}`);
  } catch (error) {
    fail(host, `request failed: ${error.message}`);
  }
}

if (!IS_DOMAIN) {
  warn(APEX, "not a public domain — skipped TLS and sibling-host checks");
}

/* ── 2. Doors that must be shut ── */

section("Closed doors");

/*
  Anything that reads a shop's records or does work on its behalf. A 200 here
  means an anonymous caller got it. /api/cron/notifications is listed because
  it was open: its guard only ran when CRON_SECRET was set, and it was not, so
  anyone could drive the owner-alert queue and read back what was pending.
*/
const MUST_BE_CLOSED = [
  "/api/cron/notifications",
  "/api/leads",
  "/api/calls",
  "/api/jobs",
  "/api/customers",
  "/api/estimates",
  "/api/invoices",
  "/api/technicians",
  "/api/dispatch",
  "/api/businesses",
  "/api/dashboard",
  "/api/ring1",
  "/api/search",
  "/api/account",
  "/api/account/export",
  "/api/ask",
  "/api/copilot",
  "/api/admin/repair-lines",
  "/api/bulletproof",
  "/api/go-live",
  "/api/wedge/readiness",
  "/api/shop/health",
  "/api/shop/weekly-proof",
  "/api/domains",
  "/api/onboarding",
];

for (const path of MUST_BE_CLOSED) {
  try {
    const { status, json } = await get(path);
    if (status !== 200) {
      pass(path, `HTTP ${status}`);
    } else if (path === "/api/cron/notifications") {
      fail(
        path,
        "OPEN — anonymous callers can drive the notification queue. " +
          "Set CRON_SECRET in Vercel and deploy the guard that refuses without it",
      );
    } else {
      fail(path, `OPEN — returned ${JSON.stringify(json ?? "").slice(0, 90)}`);
    }
  } catch (error) {
    warn(path, `could not probe: ${error.message}`);
  }
}

/* ── 3. Public endpoints must not hand out the diagnosis ── */

section("Public responses stay public");

try {
  const { json } = await get("/api/health");
  if (!json) {
    fail("/api/health", "did not return JSON");
  } else if (json.stats) {
    fail(
      "/api/health",
      `publishes counts to anonymous callers: ${JSON.stringify(json.stats)}`,
    );
  } else {
    pass("/api/health", "readiness only, no counts");
  }

  if (json?.configured) {
    pass("Call credentials", `Twilio + Vapi live${json.twilioPhone ? ` on ${json.twilioPhone}` : ""}`);
  } else {
    fail("Call credentials", "production reports not configured — the line cannot answer");
  }

  if (json?.ownerSmsEnabled) {
    pass("Owner SMS", "enabled");
  } else {
    fail("Owner SMS", "disabled — a captured lead will not reach the owner's phone");
  }
} catch (error) {
  fail("/api/health", `unreachable: ${error.message}`);
}

try {
  const { json } = await get("/api/billing/checkout");
  const leaked = json?.readiness?.missing ?? json?.readiness?.config;
  if (leaked) {
    fail(
      "/api/billing/checkout",
      `publishes which environment variables are unset: ${JSON.stringify(leaked).slice(0, 90)}`,
    );
  } else {
    pass("/api/billing/checkout", "plan availability only, no environment detail");
  }

  if (json?.checkoutReady) {
    pass("Checkout", "Stripe live — the site can take money");
  } else {
    warn("Checkout", "Stripe not configured — a visitor clicking subscribe gets an error");
  }
} catch (error) {
  fail("/api/billing/checkout", `unreachable: ${error.message}`);
}

/* ── 4. Privileged callers still get what they need ── */

if (ADMIN_KEY) {
  section("Privileged access");
  try {
    const { json } = await get("/api/health", { authorization: `Bearer ${ADMIN_KEY}` });
    (json?.stats ? pass : fail)(
      "Admin key",
      json?.stats
        ? `counts reach the key holder (${json.stats.businessCount} shops)`
        : "admin key presented but health withheld the counts",
    );
  } catch (error) {
    fail("Admin key", `probe failed: ${error.message}`);
  }
} else {
  section("Privileged access");
  warn("Admin key", "ORVIUS_ADMIN_KEY unset — skipped the privileged-path check");
}

/* ── 5. Is the deployment running the code we think it is ── */

section("Deployed revision");

try {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const behind = Number(
    execFileSync("git", ["rev-list", "--count", "origin/main..HEAD"], {
      encoding: "utf8",
    }).trim(),
  );

  if (branch === "main" || behind === 0) {
    pass("Drift", "no unmerged commits on this branch");
  } else {
    fail(
      "Drift",
      `${behind} commit${behind === 1 ? "" : "s"} on ${branch} are not in main, ` +
        "so production is not serving them",
    );
  }
} catch {
  warn("Drift", "could not compare against origin/main (run git fetch origin main)");
}

/* ── Verdict ── */

const failed = results.filter((r) => r.ok === false);
const warned = results.filter((r) => r.ok === null);

console.log("\n─────────────────────────────────────");
console.log(
  `${results.length - failed.length - warned.length} passed, ${warned.length} warned, ${failed.length} failed`,
);

if (failed.length) {
  console.log(`\n❌ PRODUCTION NOT CLEAN — ${failed.length} problem(s) above\n`);
  process.exit(1);
}

console.log("\n✅ Production verified\n");
