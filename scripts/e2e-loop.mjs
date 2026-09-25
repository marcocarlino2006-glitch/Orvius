#!/usr/bin/env node
/**
 * The operating loop in a real browser, against a running build:
 *
 *   fresh shop → caller reports a problem (Vapi end-of-call) → lead + auto-booked job
 *   → Command, Inbox, Calls and Jobs all show it → a Settings change saves
 *
 * Seeds its own test-environment shop so it never touches a real one, and fails
 * on any page error. Run against `next start`:
 *
 *   APP_URL=http://127.0.0.1:3000 AUTH_SECRET=… node scripts/e2e-loop.mjs
 */
import { encode } from "@auth/core/jwt";
import { chromium } from "playwright";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const APP_URL = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const AUTH_SECRET = process.env.AUTH_SECRET?.trim();
const VAPI_SECRET = process.env.VAPI_WEBHOOK_SECRET?.trim();
const KEEP = process.env.E2E_KEEP === "1";

const stamp = Date.now();
const digits = String(stamp).slice(-7);
const shop = {
  name: `E2E Heating ${digits}`,
  slug: `e2e-loop-${stamp}`,
  ownerEmail: `e2e-${stamp}@orvius.test`,
  line: `+1555${digits}`,
};
const caller = { name: "Morgan Ellis", phone: `+1312${digits}`, service: "Furnace blowing cold air" };

const results = [];
function record(name, ok, detail) {
  results.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    record(name, true, `${detail ?? "ok"} · ${Date.now() - started}ms`);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message.split("\n")[0] : String(err));
  }
}

async function seed() {
  const business = await prisma.business.create({
    data: {
      name: shop.name,
      slug: shop.slug,
      environment: "test",
      trade: "HVAC",
      ownerEmail: shop.ownerEmail,
      ownerPhone: "+15559870000",
      twilioPhone: shop.line,
      vapiPhoneNumber: shop.line,
      lineVerifiedAt: new Date(),
      billingStatus: "active",
      avgTicketCents: 42_000,
      address: "100 Main St, Evanston IL 60201",
      servicesJson: JSON.stringify(["Furnace repair", "AC repair", "Tune-up"]),
      hoursJson: "{}",
      timezone: "America/Chicago",
    },
  });
  await prisma.technician.create({
    data: { businessId: business.id, name: "Riley Tech", phone: "+15559870001", skillsJson: JSON.stringify(["heating"]) },
  });
  return business;
}

async function cleanup(businessId) {
  if (KEEP || !businessId) return;
  await prisma.business.delete({ where: { id: businessId } }).catch((err) => {
    console.log(`⚠️  cleanup: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  });
}

async function main() {
  if (!AUTH_SECRET) {
    console.error("❌ AUTH_SECRET is required to sign the test owner in");
    process.exit(1);
  }
  console.log(`\n🔁 Orvius operating loop · ${APP_URL}\n`);

  const business = await seed();
  record("Seed test shop", true, `${shop.name} on ${shop.line}`);

  const errors = [];
  let browser;
  try {
    await step("Caller reports a problem → lead and booked job", async () => {
      const res = await fetch(`${APP_URL}/api/webhooks/vapi`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(VAPI_SECRET ? { "x-vapi-secret": VAPI_SECRET } : {}) },
        body: JSON.stringify({
          message: {
            type: "end-of-call-report",
            call: { id: `e2e_${stamp}`, customer: { number: caller.phone }, phoneNumber: { number: shop.line } },
            summary: `${caller.name} says the furnace is blowing cold air and wants someone this week.`,
            transcript: [
              `AI: Thanks for calling ${shop.name}. What's going on?`,
              `User: Hi, this is ${caller.name}. My furnace is blowing cold air.`,
              "AI: Sorry to hear that. What's the address for the visit?",
              "User: 2200 Ridge Ave, Evanston.",
              "AI: Got it. Is this urgent, or does this week work?",
              "User: This week is fine.",
              "AI: You're booked. The office will text you to confirm the time.",
            ].join("\n"),
            durationSeconds: 150,
            analysis: {
              structuredData: {
                name: caller.name,
                phone: caller.phone,
                serviceType: caller.service,
                urgency: "this-week",
                address: "2200 Ridge Ave, Evanston IL 60201",
              },
            },
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`webhook ${res.status}: ${JSON.stringify(data).slice(0, 160)}`);
      const lead = await prisma.lead.findFirst({ where: { businessId: business.id }, include: { job: true } });
      if (!lead) throw new Error("no lead was written");
      if (!lead.job) throw new Error("lead was not booked into a job");
      return `lead ${lead.id.slice(-6)}, job ${lead.job.id.slice(-6)}`;
    });

    const token = await encode({
      token: { sub: shop.ownerEmail, email: shop.ownerEmail, name: "E2E Owner" },
      secret: AUTH_SECRET,
      salt: "authjs.session-token",
    });
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
      args: ["--no-sandbox"],
    });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const host = new URL(APP_URL).hostname;
    await ctx.addCookies([{ name: "authjs.session-token", value: token, domain: host, path: "/", httpOnly: true, sameSite: "Lax" }]);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(`${page.url()} · ${err.message.split("\n")[0]}`));
    page.setDefaultTimeout(30_000);

    const open = (path) => page.goto(`${APP_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 120_000 });

    await step("Command names the shop and what Orvius did", async () => {
      await open("/dashboard");
      await page.getByText(shop.name).first().waitFor();
      const brief = await page.locator(".cc-brief-text").first();
      await brief.filter({ hasNotText: "Reading the shop" }).waitFor();
      return (await brief.innerText()).slice(0, 90);
    });

    await step("Inbox lists the caller", async () => {
      await open("/dashboard/inbox");
      await page.getByText(caller.name).first().waitFor();
      return caller.name;
    });

    await step("Calls shows the call with a review", async () => {
      await open("/dashboard/calls");
      await page.getByText(caller.name).first().waitFor();
      await page.getByText("Answered", { exact: true }).first().waitFor();
      return "graded";
    });

    await step("Jobs shows the booked job", async () => {
      await open("/dashboard/jobs");
      await page.getByText(caller.service).first().waitFor();
      return caller.service;
    });

    await step("Settings opens over the page and saves a change", async () => {
      await open("/dashboard?settings=business");
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      const field = dialog.getByLabel("Business name");
      await field.waitFor();
      const renamed = `${shop.name} Co`;
      await field.fill(renamed);
      await field.press("Enter");
      await dialog.getByText("Saved").waitFor();
      const saved = await prisma.business.findUnique({ where: { id: business.id }, select: { name: true } });
      if (saved?.name !== renamed) throw new Error(`database has "${saved?.name}"`);
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "hidden" });
      return "saved and closed";
    });

    record("No page errors", errors.length === 0, errors.length ? errors.slice(0, 3).join(" | ") : undefined);
  } finally {
    await browser?.close();
    await cleanup(business.id);
    await prisma.$disconnect();
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
