/*
 * One supported request from the call to the money, through the routes the
 * dashboard calls, with no providers: the shared outcome view, Command's
 * bounded book-and-assign instruction, partial outcomes, durable billing
 * exceptions, refund reconciliation, the setup draft and provisioning state,
 * the technician link text and the workflow report.
 */
import { mock, test, after } from "node:test";
import assert from "node:assert/strict";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "VAPI_API_KEY"]) {
  delete process.env[key];
}

const nextServer = await import("next/server");
const deferred = [];
mock.module("next/server", { namedExports: { ...nextServer, after: (task) => deferred.push(task) } });
async function drain() {
  while (deferred.length) await deferred.shift()();
}
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { prisma } = await import("../src/lib/prisma.ts");
const { ensureDemoWorkspace, simulateCustomerConfirm } = await import("../src/lib/demo-workspace.ts");
const { transitionJob } = await import("../src/lib/job-transition.ts");
const { applyChargeRefund } = await import("../src/lib/payment-refund.ts");
const { SIMULATED_UNDELIVERABLE_PHONE } = await import("../src/lib/sms-simulation.ts");
const { onboardingAttemptKey, provisioningStatus, LINE_STEP_FAILED } = await import("../src/lib/provision-attempt.ts");
const { buildOutcome, outcomeHeadline } = await import("../src/lib/outcome.ts");
const { recordWorkflowProgress, workflowReport } = await import("../src/lib/workflow-events.ts");
const { raiseIntentException } = await import("../src/lib/sms-intent.ts");
const { issueTechAppLink } = await import("../src/lib/tech-app.ts");
const { buildCommandBoard } = await import("../src/lib/command-board.ts");
const { recordAudit } = await import("../src/lib/audit.ts");
const { workHistory } = await import("../src/lib/work-history.ts");
const askRoute = await import("../src/app/api/command/ask/route.ts");
const copilotRoute = await import("../src/app/api/copilot/route.ts");
const jobRoute = await import("../src/app/api/jobs/[id]/route.ts");
const invoiceRoute = await import("../src/app/api/jobs/[id]/invoice/route.ts");
const workRoute = await import("../src/app/api/work/route.ts");
const outcomeRoute = await import("../src/app/api/work/outcome/route.ts");
const draftRoute = await import("../src/app/api/setup/draft/route.ts");
const onboardingRoute = await import("../src/app/api/onboarding/route.ts");

after(() => prisma.$disconnect());

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const req = (method, url, body) => new Request(`http://local.test${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
async function call(fn) {
  const res = await fn();
  const body = await res.json().catch(() => null);
  await drain();
  return { status: res.status, body };
}

const INSTRUCTION = "Book Rosa Diaz in the next suitable window and assign an available qualified technician";

async function demoShop() {
  const email = `outcome-${uid()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  const shop = await prisma.business.update({
    where: { id: business.id },
    data: { autopilot: true, stripeConnectAccountId: `acct_sim_${uid()}`, stripeConnectChargesEnabled: true, stripeConnectPayoutsEnabled: true, stripeConnectDetailsSubmitted: true },
  });
  signedInAs = email;
  return shop;
}

const lead = (shop, phone = "+13125550147") =>
  prisma.lead.create({ data: { businessId: shop.id, name: "Rosa Diaz", phone, serviceType: "AC not cooling", address: "702 Main St, Evanston IL 60202", status: "new" } });

async function book() {
  const ask = await call(() => askRoute.POST(req("POST", "/api/command/ask", { text: INSTRUCTION })));
  assert.equal(ask.body?.kind, "proposal", `the instruction becomes one plan: ${JSON.stringify(ask.body)}`);
  const executed = await call(() => copilotRoute.POST(req("POST", "/api/copilot?mode=execute", { proposalId: ask.body.proposal.proposalId, approved: true })));
  assert.equal(executed.status, 200, JSON.stringify(executed.body));
  return { ask, executed };
}

const stageOf = (outcome, id) => outcome.stages.find((s) => s.stage === id);

async function fieldDone(shop, jobId) {
  for (const to of ["en_route", "on_site"]) await transitionJob({ businessId: shop.id, jobId, to, actor: { kind: "technician" }, via: "tech_app" });
  return call(() =>
    jobRoute.PATCH(req("PATCH", `/api/jobs/${jobId}`, { status: "completed", completion: { path: "field", resolutionCode: "repaired", finalAmountCents: 42_000 } }), { params: Promise.resolve({ id: jobId }) }),
  );
}

test("the bounded instruction books the first real opening, assigns a qualified technician and returns the outcome", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  const { ask, executed } = await book();
  assert.match(ask.body.message ?? ask.body.reply ?? JSON.stringify(ask.body), /first real opening/i);
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id }, include: { technician: true } });
  assert.ok(job.technician, "a qualified, free technician was assigned");
  const view = executed.body.outcome;
  assert.equal(view.headline, "Assigned; customer confirmation pending");
  assert.deepEqual(view.stages.map((s) => s.stage), ["booking", "assignment", "confirmation", "completion", "invoice", "payment"]);
  for (const s of view.stages) for (const key of ["state", "evidence", "nextActor", "nextAction", "execution", "at", "source"]) assert.ok(key in s, `${s.stage} has ${key}`);
  assert.equal(view.synthetic, true, "a demo shop's outcome is marked synthetic on the server");
  assert.doesNotMatch(executed.body.confirmation.summary, /on its way/i, "no claim the text arrived before it did");

  const started = await prisma.auditEvent.count({ where: { businessId: shop.id, action: "workflow.started" } });
  const done = await prisma.auditEvent.count({ where: { businessId: shop.id, action: "workflow.stage_done" } });
  assert.equal(started, 1);
  assert.ok(done >= 2, "booking and assignment are recorded as done");
  await recordWorkflowProgress(await buildOutcome(shop.id, { jobId: job.id }), { actor: "system" });
  assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "workflow.stage_done" } }), done, "re-reading the outcome records nothing twice");
});

test("a named technician in the instruction is a question, even a short name made of generic words", async () => {
  const shop = await demoShop();
  await lead(shop);
  for (const name of ["Anita", "Ana", "Isa"]) {
    const ask = await call(() => askRoute.POST(req("POST", "/api/command/ask", { text: `Book Rosa Diaz in the next suitable window and assign ${name}` })));
    assert.equal(ask.body?.kind, "clarify", `${name}: ${JSON.stringify(ask.body)}`);
  }
  assert.equal(await prisma.copilotAction.count({ where: { businessId: shop.id } }), 0, "no plan was made around the name");
});

test("a sent bill waiting on its receipt leaves the next step to the carrier, not a resend", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await fieldDone(shop, job.id);
  const bill = await prisma.invoice.findFirstOrThrow({ where: { jobId: job.id } });
  await prisma.invoice.update({ where: { id: bill.id }, data: { sentAt: new Date() } });
  await prisma.smsIntent.updateMany({ where: { businessId: shop.id, eventType: "invoice.pay_link", eventId: bill.id }, data: { status: "submitted", providerAccount: "AC_test_account" } });
  const invoice = stageOf(await buildOutcome(shop.id, { jobId: job.id }), "invoice");
  assert.equal(invoice.state, "unknown");
  assert.equal(invoice.nextActor, "provider", "the card offers a resend only when the next step is the owner's");
});

test("no qualified technician: the booking stands, assignment is the next decision with real options", async () => {
  const shop = await demoShop();
  await prisma.technician.updateMany({ where: { businessId: shop.id }, data: { skillsJson: JSON.stringify(["plumbing"]) } });
  const request = await lead(shop);
  const { executed } = await book();
  assert.match(executed.body.confirmation.summary, /booking is kept/i);
  assert.equal(executed.body.outcome.headline, "Booked; assignment needed");
  const options = executed.body.outcome.next.options;
  assert.ok(options.some((o) => o.kind === "assign_tech"), "free technicians not listed for the skill are offered");
  assert.ok(options.some((o) => o.kind === "link" && o.href === "/dashboard/team"));
  assert.equal(await prisma.job.count({ where: { leadId: request.id } }), 1, "one booking, never repeated");
  assert.equal((await prisma.job.findFirstOrThrow({ where: { leadId: request.id } })).technicianId, null, "Orvius didn't guess");
});

test("texting not ready: confirmation is blocked with the reason and where to fix it", async () => {
  const ownerEmail = `outcome-prod-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: {
      name: "Outcome HVAC",
      slug: `outcome-${uid()}`,
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
  const request = await lead(shop);
  const { executed } = await book();
  assert.match(executed.body.confirmation.summary, /Texting isn't ready/);
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  const view = (await call(() => outcomeRoute.GET(req("GET", `/api/work/outcome?kind=job&id=${job.id}`)))).body.outcome;
  const confirm = stageOf(view, "confirmation");
  assert.equal(confirm.state, "blocked");
  assert.match(confirm.blocker, /Texting isn't ready/);
  assert.equal(confirm.setupHref, "/dashboard/settings?settings=integrations");
  assert.equal(view.synthetic, false);
});

test("a bill the carrier refused reads as failed, not as waiting on the customer, after a reload", async () => {
  const shop = await demoShop();
  const request = await lead(shop, SIMULATED_UNDELIVERABLE_PHONE);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  const done = await fieldDone(shop, job.id);
  assert.equal(done.body.invoice.state, "failed");
  const intent = await prisma.smsIntent.findFirstOrThrow({ where: { businessId: shop.id, eventType: "invoice.pay_link" } });
  assert.equal(intent.status, "rejected", "refused before submission, not an unknown send");
  const view = (await call(() => outcomeRoute.GET(req("GET", `/api/work/outcome?kind=job&id=${job.id}`)))).body.outcome;
  assert.equal(stageOf(view, "invoice").state, "failed");
  assert.equal(stageOf(view, "invoice").execution, "failed");
  assert.equal(view.headline, "Completed; invoice delivery failed");
  const work = (await call(() => workRoute.GET(req("GET", "/api/work?view=open")))).body;
  const item = work.items.find((i) => i.id === job.id);
  assert.ok(item?.problems?.some((p) => p.kind === "invoice_undelivered" || /Bill delivery/.test(p.label)), "Work keeps it visible");
  assert.doesNotMatch(item.nextAction ?? "", /waiting on .* to pay/i);

  const board = (await buildCommandBoard(shop.id)).lanes.exceptions;
  assert.equal(board.filter((i) => i.id === `invoice-undelivered:${intent.eventId}`).length, 1);
  const failures = await prisma.auditEvent.findMany({ where: { businessId: shop.id, action: "sms.failed" }, select: { id: true, createdAt: true } });
  const billFailures = failures.filter((a) => a.createdAt >= intent.createdAt);
  assert.ok(billFailures.length > 0, "the refused bill text left its own failure row");
  for (const a of billFailures) assert.ok(!board.some((i) => i.id === `sms-failed:${a.id}`), "one refused bill text is one board item");
  for (const a of failures.filter((f) => f.createdAt < intent.createdAt)) assert.ok(board.some((i) => i.id === `sms-failed:${a.id}`), "an earlier failed text to the same number stays");
});

test("workflow measurement rows stay out of the job's history", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await fieldDone(shop, job.id);
  const rows = await prisma.auditEvent.findMany({ where: { businessId: shop.id, action: { startsWith: "workflow." } }, select: { id: true } });
  assert.ok(rows.length > 0, "the report has its rows");
  const history = await workHistory(shop.id, { kind: "job", id: job.id });
  const shown = JSON.stringify(history);
  for (const r of rows) assert.ok(!shown.includes(r.id), "no workflow row in the history");
  const observed = await prisma.auditEvent.findMany({ where: { businessId: shop.id, action: "workflow.stage_done" }, select: { actor: true, actorEmail: true } });
  assert.ok(observed.length && observed.every((r) => r.actor === "system" && r.actorEmail === null), "a stage is the records' observation, not the owner's act");
});

test("a bill that was sent and later reported undelivered stays on the board", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await fieldDone(shop, job.id);
  const bill = await prisma.invoice.findFirstOrThrow({ where: { jobId: job.id } });
  await prisma.invoice.update({ where: { id: bill.id }, data: { sentAt: new Date() } });
  const sid = `SMoutcome${uid().replace(/\W/g, "")}`;
  await prisma.smsIntent.updateMany({ where: { businessId: shop.id, eventType: "invoice.pay_link", eventId: bill.id }, data: { status: "undelivered", providerSid: sid } });
  assert.ok(await prisma.smsIntent.count({ where: { businessId: shop.id, eventType: "invoice.pay_link", eventId: bill.id } }), "the bill text has an intent");
  const message = await prisma.message.create({ data: { businessId: shop.id, phoneNormalized: "+13125550147", direction: "out", author: "orvius", body: "Your bill", sid, deliveryStatus: "undelivered" } });
  const board = await buildCommandBoard(shop.id);
  assert.ok(board.lanes.exceptions.some((i) => i.id === `invoice-undelivered:${bill.id}`), "an undelivered receipt after the send is still a bill delivery problem");
  assert.ok(!board.lanes.exceptions.some((i) => i.id === `text-failed:${message.id}`), "the same failed text is one item, not two");
  const reply = await recordAudit({ businessId: shop.id, entityType: "notification", entityId: "+13125550147", action: "sms.failed", actor: "system", summary: "Text to +13125550147 did not send — owner reply refused" });
  assert.ok(reply, "the unrelated failure was recorded");
  assert.ok((await buildCommandBoard(shop.id)).lanes.exceptions.some((i) => i.id === `sms-failed:${reply}`), "a different text that failed to the same number stays on the board");

  /* The owner fixes the number and resends: version 1 to the new number, delivered. */
  await prisma.smsIntent.create({ data: { businessId: shop.id, eventType: "invoice.pay_link", eventId: bill.id, recipientNormalized: "+13125550148", audience: "customer", status: "delivered", createdAt: new Date(Date.now() + 1000) } });
  assert.ok(!(await buildCommandBoard(shop.id)).lanes.exceptions.some((i) => i.id === `invoice-undelivered:${bill.id}`), "a delivered resend to a corrected number clears it");
  assert.notEqual(stageOf(await buildOutcome(shop.id, { jobId: job.id }), "invoice").state, "failed");
});

test("a bill the deposit covered is not offered for sending", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await fieldDone(shop, job.id);
  await prisma.invoice.updateMany({ where: { jobId: job.id }, data: { amountCents: 0, sentAt: null } });
  await prisma.smsIntent.deleteMany({ where: { businessId: shop.id, eventType: "invoice.pay_link" } });
  const view = await buildOutcome(shop.id, { jobId: job.id });
  assert.equal(stageOf(view, "invoice").state, "not_needed");
  assert.equal(stageOf(view, "payment").state, "not_needed");
});

test("a job text that never went out to the assigned technician is the owner's next step, not the technician's", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id }, include: { technician: true } });
  await prisma.job.update({ where: { id: job.id }, data: { techNotifiedAt: null, techAcceptedAt: null, techAssignedAt: new Date(Date.now() - 10 * 60_000) } });
  const assignment = stageOf(await buildOutcome(shop.id, { jobId: job.id }), "assignment");
  assert.equal(assignment.nextActor, "you");
  assert.match(assignment.evidence, /didn't go out/);
  assert.match(assignment.nextAction, new RegExp(job.technician.name));
  await prisma.job.update({ where: { id: job.id }, data: { status: "en_route", dispatchedAt: new Date() } });
  assert.equal(stageOf(await buildOutcome(shop.id, { jobId: job.id }), "assignment").nextActor, "technician", "once they're on the way, there's nobody to call about the job text");
});

test("resending a refused bill from the outcome keeps its price: tax is not added twice", async () => {
  const shop = await demoShop();
  await prisma.business.update({ where: { id: shop.id }, data: { salesTaxBps: 1000 } });
  const request = await lead(shop, SIMULATED_UNDELIVERABLE_PHONE);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await fieldDone(shop, job.id);
  const before = await prisma.invoice.findFirstOrThrow({ where: { jobId: job.id } });
  assert.equal(before.amountCents, 46_200);
  const view = (await call(() => outcomeRoute.GET(req("GET", `/api/work/outcome?kind=job&id=${job.id}`)))).body.outcome;
  assert.equal(view.money.totalCents, 42_000, "the card bills from the work total, not the taxed balance");
  await prisma.lead.update({ where: { id: request.id }, data: { phone: "+13125550147" } });
  if (job.customerId) await prisma.customer.update({ where: { id: job.customerId }, data: { phone: "+13125550147" } });
  const resent = await call(() => invoiceRoute.POST(req("POST", `/api/jobs/${job.id}/invoice`, { totalCents: view.money.totalCents, send: true }), { params: Promise.resolve({ id: job.id }) }));
  assert.equal(resent.status, 200, JSON.stringify(resent.body));
  assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: before.id } })).amountCents, 46_200);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).finalAmountCents, 42_000);
  assert.equal(resent.body.sms?.sent, true, "the corrected number gets the bill");
});

test("done with a total but no bill stays a visible item until a bill exists", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  const original = prisma.invoice.create;
  prisma.invoice.create = async () => {
    throw new Error("injected invoice write failure");
  };
  let done;
  try {
    done = await fieldDone(shop, job.id);
  } finally {
    prisma.invoice.create = original;
  }
  assert.equal(done.status, 200, "completion itself is kept");
  assert.equal(done.body.invoice.state, "failed");
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, "completed");
  const work = (await call(() => workRoute.GET(req("GET", "/api/work?view=open")))).body;
  const item = work.items.find((i) => i.id === job.id);
  assert.ok(item, "the job is still in Work after a reload");
  assert.equal(item.nextAction, "Create and send the bill");
});

test("a reporting failure after completion never turns the completed job into an error", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  const original = prisma.auditEvent.findMany;
  prisma.auditEvent.findMany = async () => {
    throw new Error("injected reporting failure");
  };
  let done;
  try {
    done = await fieldDone(shop, job.id);
  } finally {
    prisma.auditEvent.findMany = original;
  }
  assert.equal(done.status, 200, "the owner isn't told to do it again");
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, "completed");
});

test("completion is refused to AI and system actors", async () => {
  const shop = await demoShop();
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await assert.rejects(() => transitionJob({ businessId: shop.id, jobId: job.id, to: "completed", actor: { kind: "ai" }, via: "system", completion: { path: "field", resolutionCode: "repaired", finalAmountCents: 1 } }));
  assert.notEqual((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, "completed");
});

test("an unmatched refund raises one reconciliation item and one alert per channel; a replay adds none", async () => {
  const shop = await demoShop();
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 42_000, status: "paid", paidAt: new Date(), publicToken: `tok-${uid()}` } });
  for (const method of ["stripe:cs_a", "stripe:cs_b"]) {
    await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 21_000, status: "succeeded", method } });
  }
  const input = { metadata: { businessId: shop.id, kind: "invoice_pay", invoiceId: invoice.id }, amountRefundedCents: 21_000, fullyRefunded: true, chargeId: `ch_${uid()}`, paymentIntentId: `pi_${uid()}`, sessionId: null, account: shop.stripeConnectAccountId };
  await applyChargeRefund(input);
  await applyChargeRefund(input);
  const items = await prisma.reconciliationException.findMany({ where: { businessId: shop.id, status: "open" } });
  assert.equal(items.length, 1);
  assert.equal(items[0].system, "stripe");
  const alerts = await prisma.ownerNotification.findMany({ where: { businessId: shop.id, dedupeKey: { startsWith: "refund" } } });
  assert.equal(new Set(alerts.map((a) => a.channel)).size, alerts.length, "one per channel");
  assert.ok(alerts.length >= 1);
  const work = (await call(() => workRoute.GET(req("GET", "/api/work?view=open")))).body;
  const issue = (work.shopIssues ?? []).find((i) => /refund/i.test(`${i.title} ${i.detail}`));
  assert.ok(issue, "visible in Command");
  assert.equal(issue.systemOfRecord, "Stripe");
  assert.ok(issue.providerHref);

  const other = await demoShop();
  await applyChargeRefund({ ...input, chargeId: `ch_${uid()}`, metadata: { ...input.metadata, businessId: other.id }, account: "acct_someone_else" });
  assert.equal(await prisma.reconciliationException.count({ where: { businessId: other.id } }), 0, "a refund from another account never lands on this shop");
  assert.equal(await prisma.ownerNotification.count({ where: { businessId: other.id, dedupeKey: { startsWith: "refund" } } }), 0);
});

test("a failed exception write is not recorded as raised", async () => {
  const shop = await demoShop();
  const intent = await prisma.smsIntent.create({
    data: { businessId: shop.id, eventType: "job.tech_assigned", eventId: `x@${uid()}`, recipientNormalized: "+13125550131", audience: "tech", status: "rejected", severity: "severe" },
  });
  const original = prisma.auditEvent.create;
  prisma.auditEvent.create = async () => {
    throw new Error("injected audit failure");
  };
  let raised;
  try {
    raised = await raiseIntentException(intent);
  } finally {
    prisma.auditEvent.create = original;
  }
  assert.equal(raised, false);
  assert.equal((await prisma.smsIntent.findUniqueOrThrow({ where: { id: intent.id } })).exceptionRaisedAt, null, "left for the next pass to raise");
  assert.equal(await raiseIntentException(intent), true);
  assert.equal(await raiseIntentException(intent), false, "and only once");
});

test("the setup draft refuses a late older save and resumes from the account copy", async () => {
  signedInAs = `outcome-draft-${uid()}@example.test`;
  const newer = { name: "Rosa's HVAC", trade: "HVAC", ownerPhone: "3125550100", areaCode: "312", rev: 2 };
  assert.equal((await call(() => draftRoute.PUT(req("PUT", "/api/setup/draft", newer)))).status, 200);
  const late = await call(() => draftRoute.PUT(req("PUT", "/api/setup/draft", { name: "Rosa", trade: "HVAC", ownerPhone: "", areaCode: "", rev: 1 })));
  assert.equal(late.status, 409);
  assert.equal(late.body.code, "stale_draft");
  assert.equal(late.body.draft.name, newer.name, "the refusal carries the kept form");
  assert.equal((await call(() => draftRoute.PUT(req("PUT", "/api/setup/draft", newer)))).status, 200, "the same save replayed is fine");
  const back = (await call(() => draftRoute.GET())).body;
  assert.equal(back.draft.name, newer.name);
  assert.equal(back.rev, 2);
  assert.ok(back.savedAt);
  const legacy = await call(() => draftRoute.PUT(req("PUT", "/api/setup/draft", { name: "Old tab", trade: "HVAC", ownerPhone: "", areaCode: "" })));
  assert.equal(legacy.status, 200, "a page from before revisions still saves");
  assert.equal(legacy.body.rev, 3, "one past the kept count, so newer tabs see it as newer");
});

test("provisioning state is read from the attempt: running, unknown, failed before submission, and kept", async () => {
  const email = `outcome-prov-${uid()}@example.test`;
  signedInAs = email;
  const key = onboardingAttemptKey(email);
  const tag = uid().replace(/[^a-z0-9]/g, "").slice(0, 12);
  await prisma.provisionAttempt.create({ data: { key, tag, status: "running", leaseUntil: new Date(Date.now() + 60_000) } });
  assert.equal((await provisioningStatus(email)).state, "running");
  assert.equal((await provisioningStatus(email)).resume, false, "no second run while one holds the lease");

  await prisma.provisionAttempt.update({ where: { key }, data: { leaseUntil: new Date(Date.now() - 1000), phoneNumber: "+13125559999" } });
  const lost = (await call(() => onboardingRoute.GET({ nextUrl: new URL("http://local.test/api/onboarding") }))).body.provisioning;
  assert.equal(lost.state, "outcome_unknown");
  assert.equal(lost.resume, true);
  assert.equal(lost.reusesNumber, true);

  await prisma.provisionAttempt.update({ where: { key }, data: { status: "failed", phoneNumber: null, error: "Shop name is required" } });
  assert.equal((await provisioningStatus(email)).state, "failed_before_submission");
  await prisma.provisionAttempt.update({ where: { key }, data: { error: LINE_STEP_FAILED } });
  assert.equal((await provisioningStatus(email)).state, "outcome_unknown", "a broken number step may have bought one");
  await prisma.provisionAttempt.update({ where: { key }, data: { error: "x", vapiAssistantId: "asst_1" } });
  const kept = await provisioningStatus(email);
  assert.equal(kept.state, "failed_kept");
  assert.equal(kept.reusesReceptionist, true);
  assert.equal((await prisma.provisionAttempt.findUniqueOrThrow({ where: { key } })).tag, tag, "the attempt a resume claims is the same one");
});

test("the technician link text has one intent per issued link and a truthful reason when it isn't texted", async () => {
  const shop = await demoShop();
  const tech = await prisma.technician.findFirstOrThrow({ where: { businessId: shop.id } });
  const link = await issueTechAppLink({ businessId: shop.id, technicianId: tech.id, send: true, actorEmail: signedInAs, actor: "owner" });
  assert.equal(link.sent, true);
  const intents = await prisma.smsIntent.findMany({ where: { businessId: shop.id, eventType: "tech.app_link" } });
  assert.equal(intents.length, 1);
  await prisma.technician.update({ where: { id: tech.id }, data: { phone: SIMULATED_UNDELIVERABLE_PHONE } });
  const refused = await issueTechAppLink({ businessId: shop.id, technicianId: tech.id, send: true, actorEmail: signedInAs, actor: "owner" });
  assert.equal(refused.sent, false);
  assert.equal(refused.reason, "send_failed");
  assert.ok(refused.url, "the owner still has the link to hand over");
  await prisma.technician.update({ where: { id: tech.id }, data: { phone: null } });
  assert.equal((await issueTechAppLink({ businessId: shop.id, technicianId: tech.id, send: true, actorEmail: signedInAs, actor: "owner" })).reason, "no_phone");
});

test("the report keeps started, completed, collected and attributable apart, and synthetic work out of real numbers", async () => {
  const shop = await demoShop();
  const since = new Date(Date.now() - 60_000);
  const request = await lead(shop);
  await book();
  const job = await prisma.job.findFirstOrThrow({ where: { leadId: request.id } });
  await simulateCustomerConfirm(shop, job.id);
  await fieldDone(shop, job.id);
  const synthetic = await workflowReport(shop.id, since, { synthetic: true });
  assert.equal(synthetic.started, 1);
  assert.equal(synthetic.completedJobs, 1);
  assert.equal(synthetic.collectedCents, 0, "a bill is not money");
  assert.ok(synthetic.ownerDecisions >= 2);
  const real = await workflowReport(shop.id, since, { synthetic: false });
  assert.equal(real.started, 0, "demo work never counts as real");
  assert.equal(real.completedJobs, 0);
});

test("headlines name the furthest stage and what the next one is waiting on", () => {
  const s = (stage, state, evidence = "") => ({ stage, state, evidence });
  assert.equal(outcomeHeadline([s("booking", "done"), s("assignment", "needs_you"), s("confirmation", "not_yet"), s("completion", "not_yet"), s("invoice", "not_yet"), s("payment", "not_yet")]), "Booked; assignment needed");
  assert.equal(outcomeHeadline([s("booking", "done"), s("assignment", "done"), s("confirmation", "done"), s("completion", "done"), s("invoice", "done", "texted, sent (simulated)"), s("payment", "waiting")]), "Bill sent; payment pending");
  assert.equal(outcomeHeadline([s("booking", "done"), s("assignment", "done"), s("confirmation", "done"), s("completion", "done"), s("invoice", "done", "texted, delivered"), s("payment", "done")]), "Paid in full");
});
