#!/usr/bin/env node
/**
 * Prints a one-shot sign-in URL for the audit fixture shop, so the dashboard
 * can be opened in a real browser for a walkthrough rather than only under
 * Puppeteer. Same disposable account and same reserved-TLD address the audits
 * use; the token is good for ten minutes and only exists locally.
 *
 *   node scripts/audit-signin-url.mjs [baseUrl]
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer");
const { signInForAudit } = require("./audit-session.cjs");

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

/*
  The token has to be redeemed by whoever is going to hold the session, so this
  cannot sign in here. It runs the fixture setup through a throwaway page, then
  mints a second token for the caller to spend.
*/
const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
try {
  const page = await browser.newPage();
  const fixture = await signInForAudit(page, BASE);
  if (!fixture) {
    console.error("could not prepare the audit fixture");
    process.exit(1);
  }
} finally {
  await browser.close();
}

const { createScriptPrisma } = await import("./lib/db.mjs");
const { createHash, randomBytes } = await import("node:crypto");
const prisma = createScriptPrisma();
try {
  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: {
      email: "contrast-audit@orvius.invalid",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  console.log(`${BASE}/signin/verify?token=${token}`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
