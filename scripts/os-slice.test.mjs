#!/usr/bin/env node
/*
 * The first slice of the operating system, end to end on the real pipeline:
 * a call becomes a traceable request, a real window is proposed and held, the
 * customer confirms, the right people hear, and every step — including the
 * failures — is on the record. Duplicates, emergencies, failed texts, stale
 * schedules and a human taking over are each driven through, not mocked.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { ensureDemoWorkspace, simulateDemoCall, simulateCustomerConfirm } = await import("../src/lib/demo-workspace.ts");
const { buildCommandBoard } = await import("../src/lib/command-board.ts");
const { buildRequestTrace } = await import("../src/lib/request-trace.ts");
const { proposeAction, openWindows, isWindowOpen } = await import("../src/lib/copilot-propose.ts");
const { executeProposal } = await import("../src/lib/copilot-execute.ts");
const { askToAct, parseActVerb, matchName } = await import("../src/lib/command-intent.ts");
const { takeOverConversation, releaseConversation } = await import("../src/lib/takeover.ts");
const { sendCustomerSms } = await import("../src/lib/customer-sms.ts");
const { hasActiveOwnerConversation } = await import("../src/lib/messages.ts");
const { processNotificationQueue } = await import("../src/lib/notification-queue.ts");
const { sendSms } = await import("../src/lib/twilio-sms.ts");
const { SIMULATED_UNDELIVERABLE_PHONE } = await import("../src/lib/sms-simulation.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const by = { email: "owner@summit.test", actor: "owner" };

async function demoShop() {
  const { business } = await ensureDemoWorkspace(`os-${stamp()}@orvius.test`);
  return business;
}

async function leadFor(shop, phone) {
  return prisma.lead.findFirst({ where: { businessId: shop.id, phone }, orderBy: { createdAt: "desc" }, include: { job: true } });
}

test("HVAC call → request → real window → confirm → job, with every step traced", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "no_cool");
  assert.equal(call.duplicate, false);
  assert.equal(call.autoBooked, true, `expected a booking, got ${call.skipReason}`);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: call.jobId }, include: { technician: true } });
  assert.equal(job.status, "scheduled", "a proposed window, not a confirmed job");
  assert.equal(job.customerConfirmedAt, null);
  assert.ok(job.technician, "a free cooling tech is assigned");
  assert.ok(job.scheduledAt && job.scheduledAt > new Date(), "the window is in the future");

  const confirmText = await prisma.message.findFirst({
    where: { businessId: shop.id, phoneNormalized: "+13125550141", direction: "out" },
  });
  assert.ok(confirmText?.sid?.startsWith("SIM_"), "the confirmation text was simulated, not sent to a stranger");
  assert.match(confirmText.body, /Confirm here/);
  assert.ok((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).customerConfirmSentAt);

  await processNotificationQueue(10, { businessId: shop.id });
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: call.leadId, channel: "sms" } });
  assert.equal(alert?.status, "sent");
  assert.equal(alert?.deliveryStatus, "simulated");

  let board = await buildCommandBoard(shop.id);
  const proposed = board.lanes.proposed.find((i) => i.jobId === job.id);
  assert.equal(proposed?.confirm, "sent");
  assert.equal(board.lanes.confirmed.some((i) => i.jobId === job.id), false);

  const confirmed = await simulateCustomerConfirm(shop, job.id);
  assert.equal(confirmed.ok, true);
  board = await buildCommandBoard(shop.id);
  assert.ok(board.lanes.confirmed.some((i) => i.jobId === job.id), "confirmed jobs move lanes");
  assert.equal(board.lanes.proposed.some((i) => i.jobId === job.id), false);

  const trace = await buildRequestTrace(shop.id, call.leadId);
  const titles = trace.events.map((e) => e.title).join("\n");
  assert.match(titles, /playbook/i);
  assert.match(titles, /Texted the customer/);
  assert.match(titles, /confirmed the window/);
  assert.match(titles, /Owner sms alert delivered \(simulated\)/);
  assert.ok(trace.events.some((e) => e.simulated), "simulated sends are marked");
  assert.equal(trace.job.id, job.id);
});

test("duplicates: the same caller again does not create a second job", async () => {
  const shop = await demoShop();
  await simulateDemoCall(shop, "no_cool");
  const again = await simulateDemoCall(shop, "repeat_caller");
  assert.equal(again.autoBooked, false);
  assert.equal(again.skipReason, "existing_job");
  assert.equal(await prisma.job.count({ where: { businessId: shop.id, lead: { phone: "+13125550141" } } }), 1);
  const lead = await leadFor(shop, "+13125550141");
  const trace = await buildRequestTrace(shop.id, lead.id);
  assert.ok(trace.events.some((e) => /No new job created|no duplicate job/.test(e.title)));
});

test("emergencies: a gas smell is escalated, never booked, and tops Exceptions", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "gas_smell");
  assert.equal(call.autoBooked, false);
  assert.equal(call.skipReason, "safety_escalation");
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: call.leadId, channel: "sms" } });
  assert.match(alert.message, /^SAFETY/);
  const board = await buildCommandBoard(shop.id);
  assert.equal(board.lanes.exceptions[0]?.exception, "emergency");
  assert.equal(board.lanes.exceptions[0]?.leadId, call.leadId);
  assert.ok(board.lanes.requests.find((i) => i.leadId === call.leadId)?.urgent);
});

test("failed messages: a rejected confirmation is recorded, the owner is told, and Command shows it", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "bounced_text");
  assert.equal(call.autoBooked, true);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: call.jobId } });
  assert.ok(job.customerConfirmFailedAt, "the failure is stamped on the job");
  assert.equal(job.customerConfirmSentAt, null);
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "sms.failed" } }));
  const ownerAlert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, dedupeKey: `confirm-failed:${job.id}` } });
  assert.match(ownerAlert.message, /did not go through/);
  const board = await buildCommandBoard(shop.id);
  assert.ok(board.lanes.exceptions.some((i) => i.exception === "failed_message" && i.jobId === job.id));
  assert.equal(board.lanes.exceptions.filter((i) => i.exception === "failed_message").length, 1, "one bounce, one exception");
  assert.equal(board.lanes.proposed.find((i) => i.jobId === job.id)?.confirm, "failed");
  const trace = await buildRequestTrace(shop.id, call.leadId);
  assert.ok(trace.events.some((e) => e.tone === "failed"), "the failure stays in the trace");
});

test("a held request is booked only through an approved proposal at a real open window", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "no_address");
  assert.equal(call.skipReason, "missing_address");
  const refused = await proposeAction(shop, { action: "book_window", leadId: call.leadId, at: new Date(Date.now() + 86_400_000).toISOString() });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "missing_address", "no address, no technician sent");

  await prisma.lead.update({ where: { id: call.leadId }, data: { address: "1127 Davis St, Evanston IL 60201" } });
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: call.leadId } });
  const [slot] = await openWindows(shop, { kind: "lead", lead }, 1);
  assert.ok(slot, "the schedule has a real opening");
  const proposal = await proposeAction(shop, { action: "book_window", leadId: lead.id, at: slot.toISOString() });
  assert.equal(proposal.ok, true);
  assert.match(proposal.preview, /Re-check that this time is still open/);
  assert.match(proposal.preview, /No price is quoted/);
  assert.equal(await prisma.job.count({ where: { leadId: lead.id } }), 0, "proposing changes nothing");

  const board = await buildCommandBoard(shop.id);
  assert.ok(board.lanes.approvals.some((i) => i.proposalId === proposal.proposalId), "waits in Needs approval");

  const done = await executeProposal({ business: shop, proposalId: proposal.proposalId, by: { role: "owner", email: by.email } });
  assert.equal(done.ok, true, done.error);
  const booked = await prisma.job.findUniqueOrThrow({ where: { leadId: lead.id } });
  assert.equal(booked.scheduledAt.getTime(), slot.getTime(), "booked at exactly the approved time");
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "copilot.executed", jobId: booked.id } }));
  const twice = await executeProposal({ business: shop, proposalId: proposal.proposalId });
  assert.equal(twice.ok, false, "a proposal runs once");
});

test("stale schedules: a window filled after the proposal is refused at approval, with real alternatives", async () => {
  const shop = await demoShop();
  const lead = await prisma.lead.create({
    data: { businessId: shop.id, name: "Priya Shah", phone: "+13125550143", serviceType: "Annual tune-up", address: "915 Hinman Ave, Evanston IL 60202", status: "new" },
  });
  const [slot] = await openWindows(shop, { kind: "lead", lead }, 1);
  const proposal = await proposeAction(shop, { action: "book_window", leadId: lead.id, at: slot.toISOString() });
  assert.equal(proposal.ok, true);

  for (let i = 0; i < 3; i++) {
    await prisma.job.create({ data: { businessId: shop.id, title: `Walk-in ${i}`, status: "scheduled", scheduledAt: slot, durationMin: 240 } });
  }
  assert.equal(await isWindowOpen(shop, { kind: "lead", lead }, slot), false);

  const outcome = await executeProposal({ business: shop, proposalId: proposal.proposalId });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "stale_window");
  assert.match(outcome.error, /Nothing was changed/);
  assert.equal(await prisma.job.count({ where: { leadId: lead.id } }), 0);
  assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.proposalId } })).status, "proposed", "the owner can re-pick");

  const sunday = new Date(slot);
  while (new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(sunday) !== "Sun") {
    sunday.setTime(sunday.getTime() + 86_400_000);
  }
  const closed = await proposeAction(shop, { action: "book_window", leadId: lead.id, at: sunday.toISOString() });
  assert.equal(closed.ok, false);
  assert.equal(closed.reason, "window_unavailable", "a closed day is never proposed");
  assert.ok(closed.alternatives.length > 0, "real alternatives come back instead");
  for (const alt of closed.alternatives) assert.equal(await isWindowOpen(shop, { kind: "lead", lead }, new Date(alt)), true);
});

test("reschedule: re-checks the window and the tech, clears the old confirmation, texts both", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "no_cool");
  await simulateCustomerConfirm(shop, call.jobId);
  const job = await prisma.job.findUniqueOrThrow({ where: { id: call.jobId } });
  const windows = await openWindows(shop, { kind: "job", job }, 3);
  const target = windows.find((d) => d.getTime() !== job.scheduledAt.getTime());
  const proposal = await proposeAction(shop, { action: "reschedule", jobId: job.id, at: target.toISOString() });
  assert.equal(proposal.ok, true, proposal.error);
  const done = await executeProposal({ business: shop, proposalId: proposal.proposalId });
  assert.equal(done.ok, true, done.error);
  const moved = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(moved.scheduledAt.getTime(), target.getTime());
  assert.equal(moved.customerConfirmedAt, null, "the new time needs its own confirmation");
  assert.equal(moved.status, "scheduled");
  assert.ok(moved.customerConfirmSentAt, "the customer was texted the new window");
  assert.ok(await prisma.auditEvent.findFirst({ where: { jobId: job.id, action: "job.rescheduled" } }));
});

test("human takeover: Orvius goes quiet for that customer, the owner can still text, and hands back", async () => {
  const shop = await demoShop();
  const call = await simulateDemoCall(shop, "gas_smell");
  const taken = await takeOverConversation({ businessId: shop.id, phone: "+13125550144", leadId: call.leadId, by });
  assert.equal(taken.ok, true);
  assert.equal(await hasActiveOwnerConversation(shop.id, "+13125550144"), true, "replies route to the owner");

  const auto = await sendCustomerSms({ businessId: shop.id, to: "+13125550144", body: "Reminder from Orvius" });
  assert.deepEqual(auto, { sent: false, reason: "human_takeover" });
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "sms.held_for_human" } }));
  const owner = await sendCustomerSms({ businessId: shop.id, to: "+13125550144", body: "Ben is on his way.", author: "owner" });
  assert.equal(owner.sent, true);

  const board = await buildCommandBoard(shop.id);
  assert.ok(board.lanes.requests.find((i) => i.leadId === call.leadId)?.takenOver);
  assert.ok(
    !board.lanes.exceptions.some((i) => i.exception === "takeover"),
    "the customer's own card says it is taken over; a second card would be noise",
  );

  await releaseConversation({ businessId: shop.id, phone: "+13125550144", by });
  assert.equal((await sendCustomerSms({ businessId: shop.id, to: "+13125550144", body: "Back to Orvius" })).sent, true);
  const trace = await buildRequestTrace(shop.id, call.leadId);
  assert.ok(trace.events.some((e) => /took this conversation over/.test(e.title)));
  assert.ok(trace.events.some((e) => /handed the conversation back/.test(e.title)));
});

test("ask to act: real choices or a plan to approve — never an invented time", async () => {
  assert.deepEqual(parseActVerb("Book Maria tomorrow at 2"), { verb: "book", rest: "Maria tomorrow at 2" });
  assert.equal(parseActVerb("how many calls today")?.verb, undefined);
  const hit = matchName("maria lopez tomorrow 2pm", [{ name: "Maria Lopez" }, { name: "Mark Diaz" }]);
  assert.equal(hit.match.name, "Maria Lopez");
  assert.equal(hit.rest, "tomorrow 2pm");

  const shop = await demoShop();
  await prisma.lead.create({
    data: { businessId: shop.id, name: "Rosa Diaz", phone: "+13125550147", serviceType: "Heat pump short cycling", address: "702 Main St, Evanston IL 60202", status: "new" },
  });
  const choices = await askToAct(shop, "book Rosa");
  assert.equal(choices.kind, "choices");
  assert.equal(choices.options.length, 3);
  const lead = await prisma.lead.findFirstOrThrow({ where: { businessId: shop.id, name: "Rosa Diaz" } });
  for (const o of choices.options) assert.equal(await isWindowOpen(shop, { kind: "lead", lead }, new Date(o.at)), true);

  assert.equal((await askToAct(shop, "book Nobody Here tomorrow")).kind, "clarify");
  const sundayAsk = await askToAct(shop, "book Rosa sunday 10am");
  assert.equal(sundayAsk.kind, "refused", "the shop is closed Sunday");
  assert.equal(await prisma.copilotAction.count({ where: { businessId: shop.id } }), 0, "nothing was proposed from a bad time");
  assert.equal(await askToAct(shop, "what's on today"), null, "questions go to Ask, not to actions");

  const dana = await prisma.technician.create({ data: { businessId: shop.id, name: "Dana West" } });
  const eli = await prisma.technician.create({ data: { businessId: shop.id, name: "Eli Park" } });
  const titled = await prisma.job.create({
    data: {
      businessId: shop.id,
      title: "Water pooling under the furnace",
      serviceType: "Water pooling under the furnace",
      status: "scheduled",
      technicianId: eli.id,
      scheduledAt: new Date(Date.now() + 86_400_000),
    },
  });
  const assign = await askToAct(shop, "Send Dana West to Water pooling under the furnace");
  assert.equal(assign.kind, "proposal", assign.message);
  const ran = await executeProposal({ business: shop, proposalId: assign.proposal.proposalId });
  assert.equal(ran.ok, true, ran.error);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: titled.id } })).technicianId, dana.id);
  const { undoProposal } = await import("../src/lib/copilot-undo.ts");
  const undone = await undoProposal({ business: shop, proposalId: assign.proposal.proposalId });
  assert.equal(undone.ok, true, undone.error);
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: titled.id } })).technicianId, eli.id);
});

test("production workspaces never simulate", async () => {
  const shop = await prisma.business.create({ data: { name: "Real Shop", slug: `real-${stamp()}`, environment: "production" } });
  await assert.rejects(() => simulateDemoCall(shop, "no_cool"), /demo workspace/);
  assert.equal(await sendSms({ to: "+13125550141", body: "hi", businessId: shop.id, audience: "customer" }), null, "no Twilio, no send — never a fake success");
  const demo = await demoShop();
  await assert.rejects(
    () => sendSms({ to: SIMULATED_UNDELIVERABLE_PHONE, body: "hi", businessId: demo.id, audience: "customer" }),
    /Simulated carrier rejected/,
  );
});
