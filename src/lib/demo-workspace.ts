import { randomUUID } from "node:crypto";
import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { confirmJobByCustomerToken, ensureCustomerConfirmToken } from "@/lib/customer-confirm";
import { seedDemoDataset } from "@/lib/demo-dataset";
import { isOwnerDemoWorkspace, OWNER_DEMO_SLUG_PREFIX } from "@/lib/demo-fence";
import { prisma } from "@/lib/prisma";
import { withLease } from "@/lib/provision-attempt";
import { SIMULATED_UNDELIVERABLE_PHONE } from "@/lib/sms-simulation";

/**
 * A signed-in person's own HVAC demo shop. It runs the real pipeline — call
 * capture, playbook, availability, booking, confirmations, alerts, audit —
 * with texts simulated (sms-simulation) and fictional 555 numbers, so it can
 * be driven end to end without a phone line, a carrier, or a real customer.
 */
export const DEMO_OWNER_PHONE = "+13125550110";

const HOURS = JSON.stringify({
  monday: { open: "08:00", close: "18:00" },
  tuesday: { open: "08:00", close: "18:00" },
  wednesday: { open: "08:00", close: "18:00" },
  thursday: { open: "08:00", close: "18:00" },
  friday: { open: "08:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true, open: "00:00", close: "00:00" },
});

const DEFAULT_TIMEZONE = "America/Chicago";

function validTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

const SERVICES = JSON.stringify([
  { name: "No cooling / no heat repair", description: "Diagnose and repair" },
  { name: "Maintenance tune-up", description: "Seasonal service" },
  { name: "Estimate / inspection", description: "On-site quote" },
]);

const CREW = [
  { name: "Ana Ruiz", phone: "+13125550131", skills: ["cooling", "maintenance"] },
  { name: "Ben Okafor", phone: "+13125550132", skills: ["heating", "maintenance", "gas"] },
  { name: "Chris Lee", phone: "+13125550133", skills: ["airflow", "heating", "cooling"] },
];

export type DemoScenarioId =
  | "no_cool"
  | "repeat_caller"
  | "gas_smell"
  | "bounced_text"
  | "no_address"
  | "furnace_out"
  | "plumb_burst"
  | "plumb_water_heater"
  | "plumb_sewage"
  | "elec_burning"
  | "elec_breaker"
  | "elec_power_out";

type Scenario = {
  id: DemoScenarioId;
  label: string;
  expect: string;
  name: string;
  phone: string;
  serviceType: string;
  urgency: "emergency" | "same-day" | "this-week" | "flexible";
  address?: string;
  lines: string[];
};

export const DEMO_SCENARIOS: Scenario[] = [
  {
    id: "no_cool",
    label: "AC not cooling",
    expect: "Books the first real open window, assigns a cooling tech, texts a confirm link.",
    name: "Maria Lopez",
    phone: "+13125550141",
    serviceType: "AC not cooling",
    urgency: "same-day",
    address: "418 Elm St, Evanston IL 60201",
    lines: [
      "User: Hi, my AC stopped cooling, it's 84 upstairs.",
      "AI: I'm sorry — let's get someone out. What's the address?",
      "User: 418 Elm Street in Evanston.",
      "AI: Got it. I'll text you the first open window to confirm.",
    ],
  },
  {
    id: "repeat_caller",
    label: "Same caller again",
    expect: "Recognises Maria's open job and does not create a second one.",
    name: "Maria Lopez",
    phone: "+13125550141",
    serviceType: "AC not cooling",
    urgency: "same-day",
    address: "418 Elm St, Evanston IL 60201",
    lines: [
      "User: Hi, I called earlier about my AC not cooling — just checking you got it.",
      "AI: We did. You're on the schedule; the confirm link is in your texts.",
    ],
  },
  {
    id: "gas_smell",
    label: "Gas smell (emergency)",
    expect: "Safety script, no booking, owner alerted as SAFETY, shows under Problems.",
    name: "Tom Becker",
    phone: "+13125550144",
    serviceType: "Smells gas near the furnace",
    urgency: "emergency",
    address: "77 Main St, Evanston IL 60202",
    lines: [
      "User: I smell gas near my furnace in the basement.",
      "AI: Please leave the house now and call the gas company or 911 from outside. I'm alerting the owner.",
    ],
  },
  {
    id: "bounced_text",
    label: "Confirm text bounces",
    expect: "Books, the confirmation text is rejected, the owner is alerted to call.",
    name: "Dana Whitfield",
    phone: SIMULATED_UNDELIVERABLE_PHONE,
    serviceType: "Furnace tune-up",
    urgency: "this-week",
    address: "1500 Chicago Ave, Evanston IL 60201",
    lines: [
      "User: I'd like a furnace tune-up this week. This is my landline.",
      "AI: Sure — I'll send the window to this number.",
    ],
  },
  {
    id: "no_address",
    label: "Caller hangs up early",
    expect: "No address, so nothing is booked — held in Requests for a person.",
    name: "Owen Park",
    phone: "+13125550148",
    serviceType: "Thermostat blank, no heat",
    urgency: "same-day",
    lines: ["User: My thermostat is blank and there's no heat—", "AI: I can help. What's the address?"],
  },
  {
    id: "furnace_out",
    label: "Furnace out, elderly caller",
    expect: "Urgent heating job on the earliest window with a heating tech.",
    name: "James Carter",
    phone: "+13125550142",
    serviceType: "Furnace not heating",
    urgency: "emergency",
    address: "2210 Ridge Ave, Evanston IL 60201",
    lines: [
      "User: The furnace quit and my mother is 88. It's getting cold.",
      "AI: We'll get the earliest heating tech to you. Address?",
      "User: 2210 Ridge Avenue, Evanston.",
    ],
  },
];

/**
 * Sample calls for the other launch trades. They run through the same ingest,
 * playbook and booking code as the HVAC set; only the words differ.
 */
export const TRADE_SAMPLE_CALLS: Record<"Plumbing" | "Electrical", Scenario[]> = {
  Plumbing: [
    {
      id: "plumb_burst",
      label: "Burst pipe",
      expect: "Emergency: not put in a slot. The owner is alerted to call back now.",
      name: "Rosa Diaz",
      phone: "+13125550151",
      serviceType: "Burst pipe, water everywhere in the basement",
      urgency: "emergency",
      address: "910 Maple Ave, Evanston IL 60202",
      lines: [
        "User: A pipe burst in the basement and there's water everywhere.",
        "AI: Shut the main water valve if you can reach it safely. What's the address?",
        "User: 910 Maple Avenue, Evanston.",
      ],
    },
    {
      id: "plumb_water_heater",
      label: "No hot water",
      expect: "Water heater job on an open window with a water-heater tech, confirm text sent.",
      name: "Alan Brooks",
      phone: "+13125550152",
      serviceType: "Water heater, no hot water",
      urgency: "same-day",
      address: "33 Lake St, Evanston IL 60201",
      lines: ["User: Our water heater stopped, no hot water since this morning.", "AI: Let's get someone out. Address?", "User: 33 Lake Street."],
    },
    {
      id: "plumb_sewage",
      label: "Sewage backing up (safety)",
      expect: "Safety guidance, no booking, owner alerted as SAFETY.",
      name: "Grace Kim",
      phone: "+13125550153",
      serviceType: "Raw sewage coming up through the floor drain",
      urgency: "emergency",
      address: "5 Pine Ct, Evanston IL 60201",
      lines: [
        "User: Raw sewage is coming up through the floor drain.",
        "AI: Stop using water and keep everyone away from it. I'm alerting the owner now.",
      ],
    },
  ],
  Electrical: [
    {
      id: "elec_burning",
      label: "Burning smell at an outlet (safety)",
      expect: "Safety guidance, no booking, owner alerted as SAFETY.",
      name: "Victor Hale",
      phone: "+13125550161",
      serviceType: "Burning smell from a bedroom outlet",
      urgency: "emergency",
      address: "120 Oak Ave, Evanston IL 60202",
      lines: [
        "User: There's a burning smell coming from an outlet in the bedroom.",
        "AI: Shut off the main breaker if it's safe, and call 911 if you see fire. I'm alerting the owner now.",
      ],
    },
    {
      id: "elec_breaker",
      label: "Breaker keeps tripping",
      expect: "Troubleshooting job on an open window, confirm text sent.",
      name: "Nina Shah",
      phone: "+13125550162",
      serviceType: "Kitchen breaker keeps tripping",
      urgency: "same-day",
      address: "48 Grove St, Evanston IL 60201",
      lines: ["User: The kitchen breaker keeps tripping whenever we run the microwave.", "AI: We can look at that. Address?", "User: 48 Grove Street."],
    },
    {
      id: "elec_power_out",
      label: "Half the house has no power",
      expect: "Emergency: not put in a slot. The owner is alerted to call back now.",
      name: "Omar Reed",
      phone: "+13125550163",
      serviceType: "No power in half the house",
      urgency: "emergency",
      address: "702 Davis St, Evanston IL 60201",
      lines: ["User: Half the house has no power and the breakers look fine.", "AI: We'll get someone out first thing. Address?", "User: 702 Davis Street."],
    },
  ],
};

/** The sample calls that match a demo shop's trade; HVAC and anything else get the HVAC set. */
export function demoScenariosFor(trade: string | null | undefined): Scenario[] {
  return trade === "Plumbing" || trade === "Electrical" ? TRADE_SAMPLE_CALLS[trade] : DEMO_SCENARIOS;
}

export async function findDemoWorkspace(email: string) {
  return prisma.business.findFirst({
    where: { ownerEmail: email.toLowerCase(), environment: "demo", isActive: true, slug: { startsWith: OWNER_DEMO_SLUG_PREFIX } },
    orderBy: { createdAt: "asc" },
  });
}

type DemoOptions = {
  /** Fill the shop with a current-date sample week (signed-in demos). Visitor demos start empty. */
  seed?: boolean;
  timezone?: string | null;
};

export const demoLeaseKey = (email: string) => `demo:${email.trim().toLowerCase()}`;

/**
 * The person's demo shop, created on first use. Never touches a production
 * shop. Creating, seeding and resetting run one at a time per person, so a
 * double click or two tabs can't make two demo shops or seed one twice.
 */
export async function ensureDemoWorkspace(
  email: string,
  options: DemoOptions = {},
): Promise<{ business: Business; created: boolean; seeded: boolean }> {
  const owner = email.trim().toLowerCase();
  const existing = await findDemoWorkspace(owner);
  if (existing && !(options.seed && (await isEmptyDemo(existing.id)))) {
    return { business: existing, created: false, seeded: false };
  }
  return withLease(demoLeaseKey(owner), () => ensureDemoWorkspaceHeld(owner, options));
}

async function isEmptyDemo(businessId: string) {
  return (await prisma.job.count({ where: { businessId } })) === 0;
}

async function ensureDemoWorkspaceHeld(owner: string, options: DemoOptions) {
  const existing = await findDemoWorkspace(owner);
  if (existing) {
    const empty = options.seed ? await isEmptyDemo(existing.id) : false;
    if (empty) await seedDemoDataset(existing);
    return { business: existing, created: false, seeded: empty };
  }
  const business = await prisma.business.create({
    data: {
      name: "Summit Heating & Air (demo)",
      slug: `${OWNER_DEMO_SLUG_PREFIX}${randomUUID().slice(0, 12)}`,
      environment: "demo",
      trade: "HVAC",
      timezone: validTimezone(options.timezone),
      greeting: "Thanks for calling Summit Heating & Air, this is Orvius. What's going on?",
      ownerEmail: owner,
      ownerPhone: DEMO_OWNER_PHONE,
      hoursJson: HOURS,
      servicesJson: SERVICES,
      avgTicketCents: 42_000,
      billingStatus: "pilot",
      pilotEndsAt: null,
      technicians: {
        create: CREW.map((t) => ({ name: t.name, phone: t.phone, skillsJson: JSON.stringify(t.skills), isActive: true })),
      },
    },
  });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "shop.demo_created",
    actor: "owner",
    actorEmail: owner,
    summary: "Demo workspace created — texts are simulated, numbers are fictional",
  });
  if (options.seed) await seedDemoDataset(business);
  return { business, created: true, seeded: Boolean(options.seed) };
}

/**
 * Start the person's demo over at today's date: the old demo shop and
 * everything in it is deleted and a fresh one seeded. Only a shop that is
 * environment=demo, slug demo-*, and owned by this email can be reset — a
 * real shop is never in reach.
 */
export async function resetDemoWorkspace(email: string, options: Omit<DemoOptions, "seed"> = {}) {
  const owner = email.trim().toLowerCase();
  const requestedAt = Date.now();
  return withLease(demoLeaseKey(owner), async () => {
    const existing = await findDemoWorkspace(owner);
    // A reset that finished while this one waited already started over at today.
    if (existing && existing.createdAt.getTime() >= requestedAt) {
      return { business: existing, created: false, seeded: false };
    }
    if (existing) {
      if (!isOwnerDemoWorkspace(existing) || existing.ownerEmail?.toLowerCase() !== owner) {
        throw new Error("Only a demo workspace can be reset.");
      }
      await prisma.$transaction([
        prisma.lead.deleteMany({ where: { businessId: existing.id } }),
        prisma.webhookEvent.deleteMany({ where: { businessId: existing.id } }),
        prisma.business.delete({ where: { id: existing.id } }),
      ]);
    }
    return ensureDemoWorkspaceHeld(owner, { seed: true, timezone: options.timezone ?? existing?.timezone });
  });
}

export async function simulateDemoCall(
  business: Pick<Business, "id" | "environment"> & Partial<Pick<Business, "name" | "trade">>,
  scenarioId: string,
) {
  if (business.environment !== "demo") throw new Error("Simulated calls only run in a demo workspace.");
  const scenario = demoScenariosFor(business.trade).find((s) => s.id === scenarioId);
  if (!scenario) throw new Error("Unknown scenario");
  const vapiCallId = `demo_${business.id}_${scenario.id}_${randomUUID().slice(0, 8)}`;
  const result = await ingestEndOfCallReport({
    business,
    vapiCallId,
    message: {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: scenario.phone } },
      summary: `${scenario.name} called about ${scenario.serviceType}.`,
      durationSeconds: 60 + scenario.lines.length * 15,
      transcript: [`AI: ${(business.name ?? "Summit Heating & Air").replace(/\s*\(demo\)$/, "")}, this is Orvius. What's going on?`, ...scenario.lines].join("\n"),
      analysis: {
        structuredData: {
          name: scenario.name,
          phone: scenario.phone,
          serviceType: scenario.serviceType,
          urgency: scenario.urgency,
          address: scenario.address,
        },
      },
    },
  });
  return { scenario, vapiCallId, ...result };
}

/** Stand in for the customer tapping the confirm link — the same code path the link runs. */
export async function simulateCustomerConfirm(business: Pick<Business, "id" | "environment">, jobId: string) {
  if (business.environment !== "demo") throw new Error("Simulated confirmations only run in a demo workspace.");
  const job = await prisma.job.findFirst({ where: { id: jobId, businessId: business.id }, select: { id: true } });
  if (!job) throw new Error("Job not found");
  const token = await ensureCustomerConfirmToken(job.id);
  return confirmJobByCustomerToken(token);
}
