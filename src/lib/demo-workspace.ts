import { randomUUID } from "node:crypto";
import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { ingestEndOfCallReport } from "@/lib/call-ingest";
import { confirmJobByCustomerToken, ensureCustomerConfirmToken } from "@/lib/customer-confirm";
import { prisma } from "@/lib/prisma";
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

export type DemoScenarioId = "no_cool" | "repeat_caller" | "gas_smell" | "bounced_text" | "no_address" | "furnace_out";

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

export async function findDemoWorkspace(email: string) {
  return prisma.business.findFirst({
    where: { ownerEmail: email.toLowerCase(), environment: "demo", isActive: true, slug: { startsWith: "demo-" } },
  });
}

/** The person's demo shop, created on first use. Never touches a production shop. */
export async function ensureDemoWorkspace(email: string): Promise<{ business: Business; created: boolean }> {
  const owner = email.trim().toLowerCase();
  const existing = await findDemoWorkspace(owner);
  if (existing) return { business: existing, created: false };
  const business = await prisma.business.create({
    data: {
      name: "Summit Heating & Air (demo)",
      slug: `demo-${randomUUID().slice(0, 12)}`,
      environment: "demo",
      trade: "HVAC",
      timezone: "America/Chicago",
      greeting: "Thanks for calling Summit Heating & Air, this is Orvius. What's going on?",
      ownerEmail: owner,
      ownerPhone: DEMO_OWNER_PHONE,
      hoursJson: HOURS,
      servicesJson: SERVICES,
      billingStatus: "pilot",
      pilotEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60_000),
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
  return { business, created: true };
}

export async function simulateDemoCall(business: Pick<Business, "id" | "environment">, scenarioId: string) {
  if (business.environment !== "demo") throw new Error("Simulated calls only run in a demo workspace.");
  const scenario = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
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
      transcript: ["AI: Summit Heating & Air, this is Orvius. What's going on?", ...scenario.lines].join("\n"),
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
