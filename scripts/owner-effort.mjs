#!/usr/bin/env node
/*
 * One synthetic owner task, driven through the same route handlers the
 * dashboard calls, on a disposable database with no providers. It counts what
 * the owner has to do — requests, decisions, screens left, facts typed twice,
 * recovery steps — and whether a failure is still visible after a reload.
 * Timings come from the audit rows the run writes, not from estimates.
 *
 *   DATABASE_URL=file:/tmp/x.db node --experimental-strip-types \
 *     --experimental-test-module-mocks --import ./scripts/lib/register-alias.mjs \
 *     scripts/owner-effort.mjs [out.json]
 *
 * The same script runs against old and new code: it only relies on response
 * fields both have, and reads the newer ones when they are there.
 */
import { mock } from "node:test";
import { writeFileSync } from "node:fs";

for (const key of [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "VAPI_API_KEY",
]) {
  delete process.env[key];
}

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { prisma } = await import("../src/lib/prisma.ts");
const { ensureDemoWorkspace, simulateCustomerConfirm } = await import("../src/lib/demo-workspace.ts");
const { transitionJob } = await import("../src/lib/job-transition.ts");
const { applyChargeRefund } = await import("../src/lib/payment-refund.ts");
const { SIMULATED_UNDELIVERABLE_PHONE } = await import("../src/lib/sms-simulation.ts");
const { onboardingAttemptKey } = await import("../src/lib/provision-attempt.ts");
const askRoute = await import("../src/app/api/command/ask/route.ts");
const copilotRoute = await import("../src/app/api/copilot/route.ts");
const jobRoute = await import("../src/app/api/jobs/[id]/route.ts");
const workItemRoute = await import("../src/app/api/work/item/route.ts");
const workRoute = await import("../src/app/api/work/route.ts");
const draftRoute = await import("../src/app/api/setup/draft/route.ts");
const onboardingRoute = await import("../src/app/api/onboarding/route.ts");
let outcomeRoute = null;
try {
  outcomeRoute = await import("../src/app/api/work/outcome/route.ts");
} catch {
  outcomeRoute = null;
}

const INSTRUCTION = "Book Rosa Diaz in the next suitable window and assign an available qualified technician";
const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

class Tally {
  constructor(name) {
    this.name = name;
    this.requests = [];
    this.decisions = 0;
    this.navigations = [];
    this.reentries = [];
    this.recoveries = [];
    this.checks = {};
    this.notes = [];
    this.startedAt = new Date();
  }
  async call(label, fn) {
    const t0 = performance.now();
    const res = await fn();
    const body = await res.json().catch(() => null);
    this.requests.push({ label, status: res.status, ms: Math.round(performance.now() - t0) });
    return { status: res.status, body };
  }
  decide(what) {
    this.decisions += 1;
    this.notes.push(`decision: ${what}`);
  }
  navigate(screen) {
    this.navigations.push(screen);
  }
  reenter(what) {
    this.reentries.push(what);
  }
  recover(what) {
    this.recoveries.push(what);
  }
  check(key, value) {
    this.checks[key] = value;
  }
  async finish(businessId) {
    const audits = businessId
      ? await prisma.auditEvent.findMany({ where: { businessId, createdAt: { gte: this.startedAt } }, orderBy: { createdAt: "asc" }, select: { action: true, createdAt: true } })
      : [];
    const span = audits.length > 1 ? audits.at(-1).createdAt.getTime() - audits[0].createdAt.getTime() : 0;
    return {
      scenario: this.name,
      ownerRequests: this.requests.length,
      decisions: this.decisions,
      navigations: this.navigations.length,
      navigatedTo: this.navigations,
      repeatedEntry: this.reentries.length,
      repeatedEntryOf: this.reentries,
      recoveryInterventions: this.recoveries.length,
      recoverySteps: this.recoveries,
      checks: this.checks,
      auditEvents: audits.length,
      auditSpanMs: span,
      workflowEvents: audits.filter((a) => a.action.startsWith("workflow.")).map((a) => a.action),
      requestMs: this.requests.reduce((s, r) => s + r.ms, 0),
      requests: this.requests,
      notes: this.notes,
    };
  }
}

const post = (url, body) => new Request(`http://local.test${url}`, { method: "POST", body: JSON.stringify(body) });
const patch = (url, body) => new Request(`http://local.test${url}`, { method: "PATCH", body: JSON.stringify(body) });
const put = (url, body) => new Request(`http://local.test${url}`, { method: "PUT", body: JSON.stringify(body) });
const get = (url) => new Request(`http://local.test${url}`);

async function demoShop({ connect = true } = {}) {
  const email = `effort-${uid()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  const shop = await prisma.business.update({
    where: { id: business.id },
    data: connect
      ? { autopilot: true, stripeConnectAccountId: `acct_sim_${uid()}`, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectDetailsSubmitted: true }
      : { autopilot: true },
  });
  return { shop, email };
}

async function request(shop, phone = "+13125550147") {
  return prisma.lead.create({
    data: { businessId: shop.id, name: "Rosa Diaz", phone, serviceType: "AC not cooling", address: "702 Main St, Evanston IL 60202", status: "new" },
  });
}

/** The instruction, through Command: Ask, then pick if Orvius offers times, then approve. */
async function bookFromCommand(t, shop) {
  const ask = await t.call("POST /api/command/ask", () => askRoute.POST(post("/api/command/ask", { text: INSTRUCTION })));
  let proposalId = null;
  if (ask.body?.kind === "proposal") {
    proposalId = ask.body.proposal.proposalId;
  } else if (ask.body?.kind === "choices") {
    t.decide("pick one of the offered windows");
    const option = ask.body.options[0];
    const proposed = await t.call("POST /api/copilot?mode=propose", () =>
      copilotRoute.POST(post("/api/copilot?mode=propose", { action: option.action, at: option.at, leadId: option.leadId, jobId: option.jobId })),
    );
    proposalId = proposed.body?.proposalId ?? null;
  }
  t.check("askKind", ask.body?.kind ?? null);
  if (ask.body?.kind !== "proposal" && ask.body?.kind !== "choices") t.check("askMessage", ask.body?.message ?? ask.body?.error ?? null);
  if (!proposalId) return { ask, executed: null };
  t.decide("approve the plan");
  const executed = await t.call("POST /api/copilot?mode=execute", () => copilotRoute.POST(post("/api/copilot?mode=execute", { proposalId, approved: true })));
  t.check("executeOk", executed.body?.ok === true);
  t.check("executeSummary", executed.body?.confirmation?.summary ?? executed.body?.error ?? null);
  t.check("headlineAfterExecute", executed.body?.outcome?.headline ?? null);
  return { ask, executed };
}

/** What the owner sees on reload: the shared outcome when there is one, else Work's item. */
async function reload(t, kind, id) {
  if (outcomeRoute) {
    const r = await t.call("GET /api/work/outcome", () => outcomeRoute.GET(get(`/api/work/outcome?kind=${kind}&id=${id}`)));
    return { headline: r.body?.outcome?.headline ?? null, stages: r.body?.outcome?.stages ?? null, nextAction: r.body?.outcome?.next?.action ?? null, item: null };
  }
  const r = await t.call("GET /api/work/item", () => workItemRoute.GET(get(`/api/work/item?kind=${kind}&id=${id}`)));
  return { headline: null, stages: null, nextAction: r.body?.item?.nextAction ?? null, item: r.body?.item ?? null, problems: r.body?.item?.problems ?? [] };
}

async function workList(t) {
  const r = await t.call("GET /api/work", () => workRoute.GET(get("/api/work?view=open")));
  return r.body ?? {};
}

function stageState(view, stage) {
  return view.stages?.find((s) => s.stage === stage) ?? null;
}

/** The technician's own field steps; not owner effort. */
async function techWorks(shop, jobId) {
  for (const to of ["en_route", "on_site"]) {
    await transitionJob({ businessId: shop.id, jobId, to, actor: { kind: "technician" }, via: "tech_app" });
  }
}

async function complete(t, jobId) {
  t.decide("record what happened and the final amount");
  return t.call("PATCH /api/jobs/[id] completed", () =>
    jobRoute.PATCH(patch(`/api/jobs/${jobId}`, { status: "completed", completion: { path: "field", resolutionCode: "repaired", finalAmountCents: 42_000 } }), {
      params: Promise.resolve({ id: jobId }),
    }),
  );
}

/* ------------------------------------------------------------------ */

async function happyPath() {
  const t = new Tally("book_assign_complete_bill");
  const { shop, email } = await demoShop();
  signedInAs = email;
  const lead = await request(shop);
  const { executed } = await bookFromCommand(t, shop);
  const jobId = executed?.body?.result?.jobId ?? (await prisma.job.findFirst({ where: { leadId: lead.id } }))?.id;
  const job = jobId ? await prisma.job.findUnique({ where: { id: jobId }, include: { technician: true } }) : null;
  t.check("booked", Boolean(job));
  t.check("assigned", Boolean(job?.technician));
  if (!job) return t.finish(shop.id);

  await simulateCustomerConfirm(shop, job.id);
  await techWorks(shop, job.id);
  const before = await reload(t, "job", job.id);
  if (!before.stages) t.navigate("job page (to mark done and bill)");
  const done = await complete(t, job.id);
  t.check("completedStatus", done.status);
  t.check("invoiceSentFlag", done.body?.invoiceSent ?? null);
  t.check("invoiceOutcomeInResponse", done.body?.invoice?.state ?? null);
  const after = await reload(t, "job", job.id);
  t.check("headlineAfterBilling", after.headline);
  t.check("nextActionAfterBilling", after.nextAction);
  t.check("paymentStage", stageState(after, "payment")?.state ?? null);
  return t.finish(shop.id);
}

async function noAvailableTech() {
  const t = new Tally("no_available_tech");
  const { shop, email } = await demoShop();
  signedInAs = email;
  await prisma.technician.updateMany({ where: { businessId: shop.id }, data: { skillsJson: JSON.stringify(["plumbing"]) } });
  const lead = await request(shop);
  const { executed } = await bookFromCommand(t, shop);
  const job = await prisma.job.findFirst({ where: { leadId: lead.id }, include: { technician: true } });
  t.check("booked", Boolean(job));
  t.check("assigned", Boolean(job?.technician));
  const offered = executed?.body?.next?.options ?? executed?.body?.outcome?.next?.options ?? null;
  t.check("nextDecisionOffered", Array.isArray(offered) ? offered.length : 0);
  t.check("partialReported", /no technician|assignment needed/i.test(`${executed?.body?.confirmation?.summary ?? ""} ${executed?.body?.outcome?.headline ?? ""}`));
  if (!offered?.length) {
    t.navigate("job page (to pick a technician)");
    t.navigate("Team (to see who could take it)");
    t.recover("work out on their own why nobody was free");
  }
  const view = job ? await reload(t, "job", job.id) : null;
  t.check("reloadNextAction", view?.nextAction ?? null);
  t.check("reloadHeadline", view?.headline ?? null);
  t.check("bookingKept", Boolean(job && (await prisma.job.count({ where: { leadId: lead.id } })) === 1));
  return t.finish(shop.id);
}

async function textingNotReady() {
  const t = new Tally("missing_texting_readiness");
  const ownerEmail = `effort-prod-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: {
      name: "Effort HVAC",
      slug: `effort-${uid()}`,
      environment: "production",
      trade: "HVAC",
      timezone: "America/Chicago",
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail,
      ownerPhone: "+13125550100",
      hoursJson: JSON.stringify(Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => [d, { open: "08:00", close: "17:00" }]))),
      technicians: { create: [{ name: "Ana Ruiz", phone: "+13125550131", skillsJson: JSON.stringify(["cooling"]) }] },
    },
  });
  signedInAs = ownerEmail;
  const lead = await request(shop);
  const { executed } = await bookFromCommand(t, shop);
  const job = await prisma.job.findFirst({ where: { leadId: lead.id } });
  t.check("booked", Boolean(job));
  t.check("confirmationSent", Boolean(job?.customerConfirmSentAt));
  const view = job ? await reload(t, "job", job.id) : null;
  const confirm = view ? stageState(view, "confirmation") : null;
  t.check("confirmationStage", confirm ? { state: confirm.state, blocker: confirm.blocker, setup: confirm.setupHref ?? null } : null);
  t.check("reloadNextAction", view?.nextAction ?? null);
  t.check("textingReasonShown", Boolean(confirm?.blocker && /text/i.test(confirm.blocker)));
  t.check("summaryClaimsTextOnItsWay", /text is on its way/i.test(executed?.body?.confirmation?.summary ?? ""));
  if (!confirm?.setupHref) {
    t.navigate("Settings (to find out why the text didn't go)");
    t.recover("find that texting isn't approved");
  }
  return t.finish(shop.id);
}

async function failedInvoiceDelivery() {
  const t = new Tally("failed_invoice_delivery");
  const { shop, email } = await demoShop();
  signedInAs = email;
  const lead = await request(shop, SIMULATED_UNDELIVERABLE_PHONE);
  await bookFromCommand(t, shop);
  const job = await prisma.job.findFirst({ where: { leadId: lead.id } });
  if (!job) return t.finish(shop.id);
  if (!job.technicianId) {
    const tech = await prisma.technician.findFirst({ where: { businessId: shop.id } });
    await prisma.job.update({ where: { id: job.id }, data: { technicianId: tech.id } });
  }
  await techWorks(shop, job.id);
  const done = await complete(t, job.id);
  t.check("invoiceSentFlag", done.body?.invoiceSent ?? null);
  t.check("invoiceOutcomeInResponse", done.body?.invoice?.state ?? null);
  /* The owner closes the tab and comes back. */
  const view = await reload(t, "job", job.id);
  const work = await workList(t);
  const item = (work.items ?? []).find((i) => i.id === job.id);
  const visible =
    Boolean(item?.problems?.some((p) => /invoice|bill/i.test(`${p.label} ${p.detail}`) && /fail|didn't|did not|not delivered|undeliver|reject/i.test(`${p.label} ${p.detail}`))) ||
    stageState(view, "invoice")?.state === "failed";
  t.check("failureVisibleAfterReload", visible);
  t.check("reloadNextAction", view.nextAction ?? item?.nextAction ?? null);
  t.check("workSaysWaitingOnCustomer", /waiting on .* to pay/i.test(item?.nextAction ?? ""));
  if (!visible) t.recover("notice the customer never got the bill (from the customer, later)");
  return t.finish(shop.id);
}

async function completedButInvoiceFailed() {
  const t = new Tally("completed_invoice_not_created");
  const { shop, email } = await demoShop();
  signedInAs = email;
  const lead = await request(shop);
  await bookFromCommand(t, shop);
  const job = await prisma.job.findFirst({ where: { leadId: lead.id } });
  if (!job) return t.finish(shop.id);
  await techWorks(shop, job.id);
  /* The invoice write fails after the job is already marked done. */
  const original = prisma.invoice.create;
  prisma.invoice.create = async () => {
    throw new Error("simulated invoice write failure");
  };
  let done;
  try {
    done = await complete(t, job.id);
  } finally {
    prisma.invoice.create = original;
  }
  t.check("completedStatus", done.status);
  t.check("jobCompleted", (await prisma.job.findUnique({ where: { id: job.id } })).status === "completed");
  t.check("invoiceOutcomeInResponse", done.body?.invoice?.state ?? null);
  const view = await reload(t, "job", job.id);
  const work = await workList(t);
  const item = (work.items ?? []).find((i) => i.id === job.id);
  const visible = Boolean(item) || stageState(view, "invoice")?.state === "failed";
  t.check("failureVisibleAfterReload", visible);
  t.check("reloadHeadline", view.headline);
  t.check("reloadNextAction", view.nextAction ?? item?.nextAction ?? null);
  if (!visible) t.recover("remember this job was never billed");
  return t.finish(shop.id);
}

async function ambiguousRefund() {
  const t = new Tally("ambiguous_refund");
  const { shop, email } = await demoShop();
  signedInAs = email;
  const invoice = await prisma.invoice.create({
    data: { businessId: shop.id, amountCents: 42_000, status: "paid", paidAt: new Date(), publicToken: `tok-${uid()}` },
  });
  await prisma.payment.createMany({
    data: [
      { businessId: shop.id, invoiceId: invoice.id, amountCents: 21_000, status: "succeeded", method: "stripe:cs_a" },
      { businessId: shop.id, invoiceId: invoice.id, amountCents: 21_000, status: "succeeded", method: "stripe:cs_b" },
    ],
  }).catch(async () => {
    for (const method of ["stripe:cs_a", "stripe:cs_b"]) {
      await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 21_000, status: "succeeded", method } });
    }
  });
  const input = { metadata: { businessId: shop.id, kind: "invoice_pay", invoiceId: invoice.id }, amountRefundedCents: 21_000, fullyRefunded: true, chargeId: `ch_${uid()}`, paymentIntentId: `pi_${uid()}`, sessionId: null };
  let first;
  try {
    first = await applyChargeRefund(input);
  } catch (error) {
    first = { error: error.message };
  }
  t.check("refundOutcome", first);
  const recon = await prisma.reconciliationException.count({ where: { businessId: shop.id, status: "open" } });
  const alerts = await prisma.ownerNotification.count({ where: { businessId: shop.id, dedupeKey: { startsWith: "refund" } } });
  t.check("reconciliationItems", recon);
  t.check("ownerAlerts", alerts);
  const work = await workList(t);
  const visible = (work.shopIssues ?? []).some((i) => /refund/i.test(`${i.title} ${i.detail}`));
  t.check("visibleInCommand", visible);
  if (!visible) t.recover("find the refund in Stripe and match it by hand");

  /* The same callback, replayed. */
  try {
    await applyChargeRefund(input);
  } catch {
    /* counted below */
  }
  t.check("reconciliationItemsAfterReplay", await prisma.reconciliationException.count({ where: { businessId: shop.id, status: "open" } }));
  t.check("ownerAlertsAfterReplay", await prisma.ownerNotification.count({ where: { businessId: shop.id, dedupeKey: { startsWith: "refund" } } }));
  return t.finish(shop.id);
}

async function draftSave() {
  const t = new Tally("failed_or_stale_draft_save");
  signedInAs = `effort-draft-${uid()}@example.test`;
  const newer = { name: "Rosa's HVAC", trade: "HVAC", ownerPhone: "3125550100", areaCode: "312" };
  const older = { name: "Rosa", trade: "HVAC", ownerPhone: "", areaCode: "" };
  /* The newer save lands first; a slower, older one arrives after it. */
  const a = await t.call("PUT /api/setup/draft (newer)", () => draftRoute.PUT(put("/api/setup/draft", { ...newer, rev: 2 })));
  const b = await t.call("PUT /api/setup/draft (older, late)", () => draftRoute.PUT(put("/api/setup/draft", { ...older, rev: 1 })));
  t.check("newerStatus", a.status);
  t.check("lateOlderStatus", b.status);
  const back = await t.call("GET /api/setup/draft (other device)", () => draftRoute.GET());
  t.check("serverKeptNewer", back.body?.draft?.name === newer.name);
  t.check("savedAtReturned", Boolean(back.body?.savedAt));
  if (back.body?.draft?.name !== newer.name) {
    t.reenter("shop name and mobile, overwritten by the older save");
    t.recover("notice the form lost what they typed");
  }
  return t.finish(null);
}

async function lostProvisioningReply() {
  const t = new Tally("lost_provisioning_reply");
  const email = `effort-prov-${uid()}@example.test`;
  signedInAs = email;
  /* A run that started, held its lease and never answered: the browser lost the reply. */
  await prisma.provisionAttempt.create({
    data: { key: onboardingAttemptKey(email), tag: uid().replace(/[^a-z0-9]/g, "").slice(0, 12), status: "running", leaseUntil: new Date(Date.now() - 1000), phoneNumber: "+13125559999" },
  });
  const status = await t.call("GET /api/onboarding (after reload)", () => onboardingRoute.GET({ nextUrl: new URL("http://local.test/api/onboarding") }));
  const p = status.body?.provisioning ?? null;
  t.check("provisioningStateShown", p?.state ?? null);
  t.check("resumeOffered", Boolean(p?.resume));
  t.check("reusesBoughtNumber", p?.reusesNumber ?? null);
  if (!p) {
    t.recover("guess whether the line was bought; retry blind or email support");
    t.navigate("support email");
  }
  return t.finish(null);
}

async function reloadMidWorkflow() {
  const t = new Tally("mid_workflow_reload");
  const { shop, email } = await demoShop();
  signedInAs = email;
  const lead = await request(shop);
  await bookFromCommand(t, shop);
  const job = await prisma.job.findFirst({ where: { leadId: lead.id }, include: { technician: true } });
  if (!job) return t.finish(shop.id);
  const view = await reload(t, "job", job.id);
  t.check("reloadHeadline", view.headline);
  t.check("reloadNextAction", view.nextAction);
  t.check("stagesShown", view.stages ? view.stages.map((s) => `${s.stage}:${s.state}`) : null);
  if (!view.stages) t.navigate("job page (to see where it stands past the confirmation)");
  return t.finish(shop.id);
}

const results = [];
for (const run of [happyPath, noAvailableTech, textingNotReady, failedInvoiceDelivery, completedButInvoiceFailed, ambiguousRefund, draftSave, lostProvisioningReply, reloadMidWorkflow]) {
  try {
    results.push(await run());
  } catch (error) {
    results.push({ scenario: run.name, error: error instanceof Error ? `${error.message}\n${error.stack}` : String(error) });
  }
}
const summary = results.map((r) => ({
  scenario: r.scenario,
  ownerRequests: r.ownerRequests,
  decisions: r.decisions,
  navigations: r.navigations,
  repeatedEntry: r.repeatedEntry,
  recoveryInterventions: r.recoveryInterventions,
  auditSpanMs: r.auditSpanMs,
  error: r.error ? r.error.split("\n")[0] : undefined,
}));
const out = { codeHasOutcomeView: Boolean(outcomeRoute), instruction: INSTRUCTION, summary, results };
const file = process.argv[2];
if (file) writeFileSync(file, JSON.stringify(out, null, 2));
console.log(JSON.stringify(summary, null, 2));
await prisma.$disconnect();
