import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ACQUISITION_COOKIE, inviteArea, parseAcquisition } from "@/lib/acquisition";
import { auth } from "@/auth";
import { busyCalendarHost } from "@/lib/busy-calendar";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { shopLineAvailability } from "@/lib/shop-machine";
import {
  HOURS_PRESETS,
  alwaysToAPerson,
  buildGoLiveChecklist,
  defaultLevelForGoal,
  allowedSteps,
  hoursPresetFor,
  hoursSummary,
  isSetupTrade,
  missingForStep,
  stepsDone,
  needsServiceArea,
  parseSetup,
  permissionLevelFor,
  SETUP_GOALS,
  SETUP_STEPS,
} from "@/lib/setup-flow";
import {
  SetupError,
  findSetupSandbox,
  readSetupTest,
  runSetupTest,
  saveSetupDay,
  saveSetupGoal,
  saveSetupLiveDraft,
  saveSetupPermissions,
  scenariosFor,
  setSetupStep,
  startSetup,
} from "@/lib/setup-sandbox";
import { activationVersions } from "@/lib/activation-ack";
import { loadCapabilities } from "@/lib/capabilities";
import { openingWithNotice } from "@/lib/vapi";
import { ACTIVE_SHOP_COOKIE } from "@/lib/workspace-access";
import { NOT_YET_TRADE } from "@/lib/trades";
import type { Business } from "@prisma/client";
import type { Trade } from "@/lib/trades";
import { standardServiceNames } from "@/lib/provision-business";

const tradeSchema = z.string().refine(isSetupTrade, NOT_YET_TRADE);
const goalIds = SETUP_GOALS.map((g) => g.id) as [string, ...string[]];
const hoursIds = HOURS_PRESETS.map((h) => h.id) as [string, ...string[]];

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    name: z.string().trim().min(2, "Add your business name").max(80),
    trade: tradeSchema,
    timezone: z.string().max(64).optional(),
    found: z
      .object({
        address: z.string().trim().max(200).optional(),
        hoursJson: z.string().max(2000).optional(),
        source: z.enum(["website", "google"]).optional(),
      })
      .optional(),
  }),
  z.object({ action: z.literal("goal"), goal: z.enum(goalIds) }),
  z.object({
    action: z.literal("day"),
    hours: z.enum([...hoursIds, "listing"] as [string, ...string[]]),
    services: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
    zips: z.array(z.string().regex(/^\d{5}$/)).max(60).optional(),
    team: z.enum(["solo", "crew"]).optional(),
    crew: z
      .array(z.object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().min(10).max(32) }))
      .max(6)
      .optional(),
  }),
  z.object({ action: z.literal("permissions"), level: z.enum(["alert", "offer", "confirm"]), followUps: z.boolean() }),
  z.object({ action: z.literal("test"), scenario: z.enum(["routine", "exception"]) }),
  z.object({ action: z.literal("step"), step: z.enum(SETUP_STEPS) }),
  z.object({
    action: z.literal("draft"),
    ownerPhone: z.string().trim().max(32).optional(),
    areaCode: z.string().regex(/^\d{0,3}$/).optional(),
  }),
]);

type FactSource = "confirmed" | "imported" | "starting_default" | "unknown";

/** Where each business fact came from, so nothing Orvius filled in reads as something the owner said. */
function businessFacts(business: Business, setup: ReturnType<typeof parseSetup>) {
  const done = stepsDone(setup);
  const fact = (label: string, value: string | null, source: FactSource, note: string) => ({ label, value, source, note });
  let zips: string[] = [];
  try {
    const parsed = JSON.parse(business.serviceZipsJson || "[]");
    zips = Array.isArray(parsed) ? parsed : [];
  } catch {
    zips = [];
  }
  return [
    fact("Business name", business.name, "confirmed", "You entered it."),
    fact("Business type", business.trade, "confirmed", "You chose it."),
    fact("Time zone", business.timezone, setup.done?.business ? "imported" : "starting_default", "Read from your device. Change it in Settings if it's wrong."),
    fact(
      "Open hours",
      hoursSummary(business.hoursJson) ?? hoursPresetFor(business.hoursJson),
      done.day ? "confirmed" : "starting_default",
      done.day ? "You chose them." : "A starting week: weekdays 8am–6pm, Saturday 9am–2pm, Sunday closed. Change it on the desk.",
    ),
    fact(
      "Services",
      null,
      done.day ? "confirmed" : "starting_default",
      done.day ? "You picked the work you take." : "The usual list for your trade, not yet confirmed.",
    ),
    fact("Service area", zips.length ? `${zips.length} ZIP codes` : null, zips.length ? "confirmed" : "unknown", zips.length ? "You listed them." : "Not set. Orvius won't turn anyone away for distance."),
    fact("Shop address", business.address, business.address ? "confirmed" : "unknown", business.address ? "On file." : "Not set."),
    fact(
      "What Orvius may do",
      setup.permissions ?? (business.bookingMode === "book" && !business.autopilot ? "offer" : null),
      setup.permissions ? "confirmed" : business.bookingMode === "book" && !business.autopilot ? "starting_default" : "unknown",
      setup.permissions
        ? "You chose it."
        : business.bookingMode === "book" && !business.autopilot
          ? "Starts ready to offer open times. It takes the request until you set how far apart jobs sit, on the desk."
          : "Not chosen.",
    ),
  ];
}

function serviceChoices(business: Business, trade: Trade | null) {
  let current: string[] = [];
  try {
    const parsed = JSON.parse(business.servicesJson || "[]");
    current = Array.isArray(parsed) ? parsed.map((s) => (typeof s?.name === "string" ? s.name : "")).filter(Boolean) : [];
  } catch {
    current = [];
  }
  const standard = trade ? standardServiceNames(trade) : [];
  return { options: [...new Set([...standard, ...current])], chosen: current };
}

async function view(business: Business | null) {
  if (!business) return { sandbox: null };
  const setup = parseSetup(business.setupJson);
  const trade = (business.trade ?? null) as Trade | null;
  const [crew, test] = await Promise.all([
    prisma.technician.count({ where: { businessId: business.id, isActive: true } }),
    readSetupTest(business),
  ]);
  let zips: string[] = [];
  try {
    const parsed = JSON.parse(business.serviceZipsJson || "[]");
    zips = Array.isArray(parsed) ? parsed.filter((z): z is string => typeof z === "string") : [];
  } catch {
    zips = [];
  }
  const level = setup.permissions ? permissionLevelFor(business) : defaultLevelForGoal(setup.goal);
  const [capabilities, uncertain] = await Promise.all([
    loadCapabilities(business.id),
    prisma.providerEffect.findMany({
      where: { businessId: business.id, status: { in: ["uncertain", "accepted", "failed"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { provider: true, operation: true, status: true, lastError: true, updatedAt: true },
    }),
  ]);
  const allowed = allowedSteps(setup);
  const resumeAt = setup.step && allowed.includes(setup.step) ? setup.step : (allowed.at(-1) ?? "business");
  return {
    sandbox: {
      id: business.id,
      name: business.name,
      trade,
      step: resumeAt,
      progress: {
        done: stepsDone(setup),
        allowed,
        missing: Object.fromEntries(SETUP_STEPS.map((s) => [s, missingForStep(s, setup)])),
      },
      failures: setup.failures ?? [],
      liveDraft: setup.liveDraft ?? {},
      facts: businessFacts(business, setup),
      capabilities,
      providerEffects: uncertain.map((e) => ({ ...e, updatedAt: e.updatedAt.toISOString() })),
      goal: setup.goal ?? null,
      team: setup.team ?? null,
      crew,
      hours: hoursPresetFor(business.hoursJson),
      importedHours: Boolean(setup.imported?.hours && hoursSummary(business.hoursJson)),
      importedHoursSummary: setup.imported?.hours ? hoursSummary(business.hoursJson) : null,
      importedAddress: setup.imported?.address ? business.address : null,
      services: serviceChoices(business, trade),
      zips,
      needsServiceArea: needsServiceArea(trade),
      calendar: business.busyCalendarUrl ? busyCalendarHost(business.busyCalendarUrl) : null,
      level,
      followUps: business.followUpMode === "auto",
      alwaysToAPerson: alwaysToAPerson(trade),
      scenarios: scenariosFor(business).map(({ id, label, expect, lines }) => ({ id, label, expect, lines })),
      testedAt: setup.testedAt ?? null,
      test,
      opening: openingWithNotice(business.greeting ?? "", business.name),
      activation: activationVersions(business),
      checklist: buildGoLiveChecklist({
        sandbox: true,
        line: business.vapiPhoneNumber ?? business.twilioPhone ?? null,
        lineVerifiedAt: business.lineVerifiedAt,
        overflowForwardConfirmedAt: business.overflowForwardConfirmedAt,
        overflowProvedAt: business.overflowProvedAt,
        ownerPhone: business.ownerPhone,
        ownerSmsOptOutAt: business.ownerSmsOptOutAt,
        recordingDisclosed: false,
      }),
      timezone: business.timezone,
      address: business.address,
    },
  };
}

/** The invite cookie, or null outside a request (scripts, tests). */
async function readInvite() {
  try {
    const raw = (await cookies()).get(ACQUISITION_COOKIE)?.value;
    return inviteArea(parseAcquisition(raw));
  } catch {
    return null;
  }
}

async function signedInEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

async function signedInName(): Promise<string | null> {
  const session = await auth();
  return session?.user?.name?.trim() || null;
}

export async function GET() {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const live = await prisma.business.findFirst({
    where: { ownerEmail: email, isActive: true, environment: "production" },
    select: { id: true },
  });
  return NextResponse.json({
    live: Boolean(live),
    line: await shopLineAvailability(),
    invited: await readInvite(),
    ...(await view(await findSetupSandbox(email))),
  });
}

/** Test mode only: every action here writes settings or simulated records. Nothing reaches a real caller. */
export async function POST(request: Request) {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const limited = await sharedRateLimit({ key: `setup:${email}`, limit: 40, windowMs: 60_000 });
  if (!limited.ok) return tooManyRequests(limited.retryAfterSec);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Check your answer and try again." }, { status: 400 });
  }
  const body = parsed.data;
  try {
    let business: Business;
    switch (body.action) {
      case "start": {
        const invited = await readInvite();
        business = await startSetup(email, {
          name: body.name,
          trade: body.trade as Trade,
          timezone: body.timezone,
          found: body.found,
          invite: invited && invited.trade === body.trade ? invited : null,
        });
        break;
      }
      case "goal":
        business = await saveSetupGoal(email, body.goal as (typeof SETUP_GOALS)[number]["id"]);
        break;
      case "day":
        business = await saveSetupDay(email, {
          hours: body.hours as (typeof HOURS_PRESETS)[number]["id"] | "listing",
          services: body.services,
          zips: body.zips,
          team: body.team,
          crew: body.crew,
          ownerName: await signedInName(),
        });
        break;
      case "permissions":
        business = await saveSetupPermissions(email, body.level, body.followUps);
        break;
      case "test": {
        const tested = await runSetupTest(email, body.scenario);
        if (tested.duplicate) return NextResponse.json({ error: "That test already ran. Try again." }, { status: 409 });
        business = (await findSetupSandbox(email))!;
        break;
      }
      case "step":
        business = await setSetupStep(email, body.step);
        break;
      case "draft":
        business = await saveSetupLiveDraft(email, { ownerPhone: body.ownerPhone, areaCode: body.areaCode });
        break;
    }
    const response = NextResponse.json({ ok: true, live: false, ...(await view(business)) });
    if (body.action === "start") {
      response.cookies.set(ACTIVE_SHOP_COOKIE, business.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof SetupError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
