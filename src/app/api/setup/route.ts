import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { busyCalendarHost } from "@/lib/busy-calendar";
import { prisma } from "@/lib/prisma";
import { sharedRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  HOURS_PRESETS,
  alwaysToAPerson,
  buildGoLiveChecklist,
  defaultLevelForGoal,
  hoursPresetFor,
  isSetupTrade,
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
  saveSetupPermissions,
  scenariosFor,
  setSetupStep,
  startSetup,
} from "@/lib/setup-sandbox";
import { openingWithNotice } from "@/lib/vapi";
import { ACTIVE_SHOP_COOKIE } from "@/lib/workspace-access";
import { NOT_YET_TRADE } from "@/lib/trades";
import type { Business } from "@prisma/client";
import type { Trade } from "@/lib/trades";

const tradeSchema = z.string().refine(isSetupTrade, NOT_YET_TRADE);
const goalIds = SETUP_GOALS.map((g) => g.id) as [string, ...string[]];
const hoursIds = HOURS_PRESETS.map((h) => h.id) as [string, ...string[]];

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    name: z.string().trim().min(2, "Add your business name").max(80),
    trade: tradeSchema,
    timezone: z.string().max(64).optional(),
  }),
  z.object({ action: z.literal("goal"), goal: z.enum(goalIds) }),
  z.object({
    action: z.literal("day"),
    hours: z.enum(hoursIds),
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
]);

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
  return {
    sandbox: {
      id: business.id,
      name: business.name,
      trade,
      step: setup.step ?? "goal",
      goal: setup.goal ?? null,
      team: setup.team ?? null,
      crew,
      hours: hoursPresetFor(business.hoursJson),
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
      checklist: buildGoLiveChecklist({
        sandbox: true,
        line: business.vapiPhoneNumber ?? business.twilioPhone ?? null,
        lineVerifiedAt: business.lineVerifiedAt,
        overflowForwardConfirmedAt: business.overflowForwardConfirmedAt,
        ownerPhone: business.ownerPhone,
        ownerSmsOptOutAt: business.ownerSmsOptOutAt,
        recordingDisclosed: false,
      }),
      timezone: business.timezone,
      address: business.address,
    },
  };
}

async function signedInEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? null;
}

export async function GET() {
  const email = await signedInEmail();
  if (!email) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const live = await prisma.business.findFirst({
    where: { ownerEmail: email, isActive: true, environment: "production" },
    select: { id: true },
  });
  return NextResponse.json({ live: Boolean(live), ...(await view(await findSetupSandbox(email))) });
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
      case "start":
        business = await startSetup(email, { name: body.name, trade: body.trade as Trade, timezone: body.timezone });
        break;
      case "goal":
        business = await saveSetupGoal(email, body.goal as (typeof SETUP_GOALS)[number]["id"]);
        break;
      case "day":
        business = await saveSetupDay(email, {
          hours: body.hours as (typeof HOURS_PRESETS)[number]["id"],
          zips: body.zips,
          team: body.team,
          crew: body.crew,
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
