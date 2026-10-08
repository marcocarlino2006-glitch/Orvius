import { randomUUID } from "node:crypto";
import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { normalizePhone } from "@/lib/customer";
import { processNotificationQueue } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { DEFAULT_HOURS_JSON, servicesForTrade, uniqueSlug } from "@/lib/provision-business";
import { clearTestRecords } from "@/lib/setup-test-records";
import {
  HOURS_PRESETS,
  isSetupSandbox,
  parseSetup,
  permissionSettings,
  setupScenarios,
  type HoursPresetId,
  type PermissionLevel,
  type SetupGoal,
  type SetupScenarioId,
  type SetupState,
  type SetupStep,
} from "@/lib/setup-flow";
import { isSimulatedSid } from "@/lib/sms-simulation";
import type { Trade } from "@/lib/trades";

const TEST_WINDOW_DAYS = 90;

export class SetupError extends Error {}

export async function findSetupSandbox(email: string): Promise<Business | null> {
  const rows = await prisma.business.findMany({
    where: { ownerEmail: email.trim().toLowerCase(), environment: "test", isActive: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return rows.find((row) => isSetupSandbox(row)) ?? null;
}

async function ownsLiveShop(email: string): Promise<boolean> {
  const live = await prisma.business.findFirst({
    where: { ownerEmail: email.trim().toLowerCase(), isActive: true, environment: "production" },
    select: { id: true },
  });
  return Boolean(live);
}

function mergeSetup(business: Pick<Business, "setupJson">, patch: Partial<SetupState>): string {
  return JSON.stringify({ ...parseSetup(business.setupJson), ...patch, sandbox: true });
}

/** Step 1: the test-mode shop, created the moment the owner names their business type. */
export async function startSetup(
  email: string,
  input: { name: string; trade: Trade; timezone?: string | null },
): Promise<Business> {
  const owner = email.trim().toLowerCase();
  if (await ownsLiveShop(owner)) throw new SetupError("Your business is already live. Open Command to run it.");
  const name = input.name.trim().slice(0, 80);
  const greeting = `Thanks for calling ${name}. How can I help you today?`;
  const existing = await findSetupSandbox(owner);

  if (existing) {
    const tradeChanged = existing.trade !== input.trade;
    const updated = await prisma.business.update({
      where: { id: existing.id },
      data: {
        name,
        trade: input.trade,
        greeting,
        ...(tradeChanged ? { servicesJson: servicesForTrade(input.trade) } : {}),
        ...(input.timezone ? { timezone: input.timezone } : {}),
        setupJson: mergeSetup(existing, { step: "goal" }),
      },
    });
    if (tradeChanged) await clearTestRecords(existing.id);
    return updated;
  }

  const business = await prisma.business.create({
    data: {
      name,
      slug: await uniqueSlug(name),
      environment: "test",
      trade: input.trade,
      greeting,
      ownerEmail: owner,
      hoursJson: DEFAULT_HOURS_JSON,
      servicesJson: servicesForTrade(input.trade),
      ...(input.timezone ? { timezone: input.timezone } : {}),
      billingStatus: "pilot",
      pilotEndsAt: new Date(Date.now() + TEST_WINDOW_DAYS * 24 * 60 * 60_000),
      bookingMode: "alert",
      autopilot: false,
      setupJson: JSON.stringify({ sandbox: true, step: "goal" } satisfies SetupState),
    },
  });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "setup.started",
    actor: "owner",
    actorEmail: owner,
    summary: `Test mode started for ${name}. No phone line, no charge, texts are simulated.`,
  });
  return business;
}

async function requireSandbox(email: string): Promise<Business> {
  const business = await findSetupSandbox(email);
  if (!business) throw new SetupError("Start by telling us what kind of business you run.");
  return business;
}

export async function saveSetupGoal(email: string, goal: SetupGoal): Promise<Business> {
  const business = await requireSandbox(email);
  return prisma.business.update({
    where: { id: business.id },
    data: { setupJson: mergeSetup(business, { goal, step: "day" }) },
  });
}

export async function saveSetupDay(
  email: string,
  input: { hours: HoursPresetId; zips?: string[]; team?: "solo" | "crew"; crew?: Array<{ name: string; phone: string }> },
): Promise<Business> {
  const business = await requireSandbox(email);
  const preset = HOURS_PRESETS.find((item) => item.id === input.hours);
  if (!preset) throw new SetupError("Pick the hours that fit your week.");
  if (input.team === "crew" && input.crew?.length) {
    const existing = await prisma.technician.findMany({ where: { businessId: business.id }, select: { phone: true } });
    const known = new Set(existing.map((t) => normalizePhone(t.phone)).filter(Boolean));
    const fresh = input.crew
      .map((person) => ({ name: person.name.trim().slice(0, 60), phone: normalizePhone(person.phone) }))
      .filter((person): person is { name: string; phone: string } => Boolean(person.name && person.phone && !known.has(person.phone)))
      .slice(0, 6);
    if (fresh.length) {
      await prisma.technician.createMany({ data: fresh.map((person) => ({ businessId: business.id, ...person })) });
    }
  }
  return prisma.business.update({
    where: { id: business.id },
    data: {
      hoursJson: preset.hoursJson,
      ...(input.zips ? { serviceZipsJson: JSON.stringify(input.zips) } : {}),
      setupJson: mergeSetup(business, { step: "permissions", ...(input.team ? { team: input.team } : {}) }),
    },
  });
}

export async function saveSetupPermissions(email: string, level: PermissionLevel, followUps: boolean): Promise<Business> {
  const business = await requireSandbox(email);
  const settings = permissionSettings(level);
  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      bookingMode: settings.bookingMode,
      autopilot: settings.autopilot,
      followUpMode: followUps ? "auto" : "ask",
      setupJson: mergeSetup(business, { step: "test", permissions: level }),
    },
  });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "setup.permissions",
    actor: "owner",
    actorEmail: email,
    summary:
      settings.bookingMode === "alert"
        ? "Orvius takes requests and alerts you. You set every time."
        : settings.autopilot
          ? "Orvius offers open times, books, assigns the clear fit and confirms."
          : "Orvius offers open times and books. You assign the work.",
    detail: { level, followUps },
  });
  return updated;
}

export async function setSetupStep(email: string, step: SetupStep): Promise<Business> {
  const business = await requireSandbox(email);
  return prisma.business.update({ where: { id: business.id }, data: { setupJson: mergeSetup(business, { step }) } });
}

function serviceZips(business: Pick<Business, "serviceZipsJson">): string[] {
  try {
    const parsed = JSON.parse(business.serviceZipsJson || "[]");
    return Array.isArray(parsed) ? parsed.filter((z): z is string => typeof z === "string") : [];
  } catch {
    return [];
  }
}

export function scenariosFor(business: Pick<Business, "trade" | "serviceZipsJson" | "address">) {
  if (!business.trade) return [];
  return setupScenarios({ trade: business.trade as Trade, serviceZips: serviceZips(business), shopAddress: business.address });
}

/** Step 5: one scripted call through the real pipeline. Earlier test records are cleared first. */
export async function runSetupTest(email: string, scenarioId: SetupScenarioId) {
  const business = await requireSandbox(email);
  const scenario = scenariosFor(business).find((item) => item.id === scenarioId);
  if (!scenario) throw new SetupError("Pick a test call.");
  await clearTestRecords(business.id);
  const vapiCallId = `setup_${business.id}_${scenario.id}_${randomUUID().slice(0, 8)}`;
  const opening = `Thanks for calling ${business.name}. This call may be recorded and is answered by an automated receptionist.`;
  const result = await ingestEndOfCallReport({
    business,
    vapiCallId,
    message: {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: scenario.phone } },
      summary: `${scenario.name} called about ${scenario.serviceType.toLowerCase()}.`,
      durationSeconds: 45 + scenario.lines.length * 12,
      transcript: [`AI: ${opening}`, ...scenario.lines].join("\n"),
      analysis: {
        structuredData: {
          name: scenario.name,
          phone: scenario.phone,
          serviceType: scenario.serviceType,
          urgency: scenario.urgency,
          ...(scenario.address ? { address: scenario.address } : {}),
        },
      },
    },
  });
  await processNotificationQueue(10, { businessId: business.id });
  const testedAt = new Date().toISOString();
  await prisma.business.update({
    where: { id: business.id },
    data: { setupJson: mergeSetup(business, { testedAt, step: "test" }) },
  });
  return { scenario, ...result };
}

export type SetupTestMessage = { to: "customer" | "you"; channel: "text" | "email"; body: string; simulated: boolean; at: string };

export type SetupTestResult = {
  scenarioId: SetupScenarioId | null;
  request: { name: string | null; phone: string | null; need: string | null; urgency: string | null; address: string | null } | null;
  decision: { outcome: "booked" | "held" | "escalated"; headline: string; when: string | null; trail: string[] };
  messages: SetupTestMessage[];
  exception: string | null;
};

const HELD_ACTIONS = new Set(["lead.held", "lead.follow_up", "lead.answered", "service_area.checked"]);

/** What the last test call did, read back from the records it wrote. */
export async function readSetupTest(business: Pick<Business, "id" | "timezone">): Promise<SetupTestResult | null> {
  const call = await prisma.call.findFirst({
    where: { businessId: business.id, vapiCallId: { startsWith: "setup_" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, vapiCallId: true, createdAt: true },
  });
  if (!call) return null;
  const scenarioId = (call.vapiCallId?.split("_")[2] ?? null) as SetupScenarioId | null;
  const lead = await prisma.lead.findFirst({
    where: { businessId: business.id, callId: call.id },
    select: {
      id: true,
      name: true,
      phone: true,
      serviceType: true,
      urgency: true,
      address: true,
      job: { select: { id: true, scheduledAt: true, technician: { select: { name: true } } } },
    },
  });
  const [audits, customerTexts, ownerAlerts] = await Promise.all([
    prisma.auditEvent.findMany({
      where: { businessId: business.id, createdAt: { gte: call.createdAt }, NOT: { action: { startsWith: "setup." } } },
      orderBy: { createdAt: "asc" },
      select: { action: true, summary: true },
      take: 30,
    }),
    prisma.message.findMany({
      where: { businessId: business.id, direction: "out", createdAt: { gte: call.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { body: true, sid: true, createdAt: true },
      take: 10,
    }),
    prisma.ownerNotification.findMany({
      where: { businessId: business.id, createdAt: { gte: call.createdAt } },
      orderBy: { createdAt: "asc" },
      select: { channel: true, message: true, deliveryId: true, deliveryStatus: true, status: true, createdAt: true },
      take: 10,
    }),
  ]);

  const job = lead?.job ?? null;
  const safety = audits.some((a) => a.action === "lead.escalated");
  const when = job?.scheduledAt
    ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: business.timezone || "America/New_York",
      }).format(job.scheduledAt)
    : null;
  const held = [...audits].reverse().find((a) => HELD_ACTIONS.has(a.action));

  const decision: SetupTestResult["decision"] = job
    ? {
        outcome: "booked",
        headline: `Booked ${when ?? "the first open time"}${job.technician?.name ? ` with ${job.technician.name}` : ""}`,
        when,
        trail: audits.map((a) => a.summary),
      }
    : safety
      ? {
          outcome: "escalated",
          headline: "Not booked. Sent straight to you as a safety call.",
          when: null,
          trail: audits.map((a) => a.summary),
        }
      : {
          outcome: "held",
          headline: held?.summary ?? "Held for you to decide",
          when: null,
          trail: audits.map((a) => a.summary),
        };

  const messages: SetupTestMessage[] = [
    ...customerTexts.map((m) => ({
      to: "customer" as const,
      channel: "text" as const,
      body: m.body,
      simulated: isSimulatedSid(m.sid),
      at: m.createdAt.toISOString(),
    })),
    ...ownerAlerts
      .filter((n) => n.status === "sent")
      .map((n) => ({
        to: "you" as const,
        channel: n.channel === "sms" ? ("text" as const) : ("email" as const),
        body: n.message ?? "",
        simulated: n.deliveryStatus === "simulated" || isSimulatedSid(n.deliveryId),
        at: n.createdAt.toISOString(),
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const exception = safety
    ? "Safety call. Orvius never books these. A person has to call back."
    : !job && held
      ? held.action === "lead.held" && held.summary.includes("decide every booking")
        ? null
        : "Needs a person. Orvius held it instead of guessing."
      : null;

  return {
    scenarioId,
    request: lead
      ? { name: lead.name, phone: lead.phone, need: lead.serviceType, urgency: lead.urgency, address: lead.address }
      : null,
    decision,
    messages,
    exception,
  };
}
