import { randomBytes } from "node:crypto";
import type { Business } from "@prisma/client";
import { openWindows, proposeAction } from "@/lib/copilot-propose";
import { deriveDemandSignal } from "@/lib/demand-capture";
import { prisma } from "@/lib/prisma";

/**
 * A normal week at a healthy HVAC shop, dated from the moment it is seeded so
 * it never opens onto a schedule of overdue jobs. Every stage of the job loop
 * is here once — a new request, a plan waiting for approval, today's crew on
 * site and on the way, a job waiting on the customer, one waiting on a tech,
 * an estimate out, done-not-billed, billed-not-paid, paid — plus one visit
 * that passed without starting, so recovery can be tried too.
 *
 * Only ever written into an environment=demo shop. Phone numbers are
 * fictional 555-01xx numbers outside the simulated-call scenarios' range, so
 * a simulated call is never mistaken for a returning sample customer.
 */

const H = 3_600_000;

type JobSpec = {
  tech: number | null;
  /** Hours from now. */
  when: number;
  status: "scheduled" | "confirmed" | "en_route" | "on_site" | "completed";
  title?: string;
  /** Customer tapped the confirm link. */
  customerConfirmed?: boolean;
  /** Confirm text sent, no answer yet. */
  confirmSent?: boolean;
  techAccepted?: boolean;
  quote?: number;
  estimate?: "sent" | "accepted";
  /** Completed: paid in full, billed and unpaid, or not billed yet. */
  money?: { kind: "paid" | "billed" | "unbilled"; cents: number };
};

type Sample = {
  ago: number;
  name: string;
  phone: string;
  service: string;
  code: string;
  urgency: "emergency" | "same-day" | "this-week" | "flexible";
  address: string | null;
  source?: "call" | "sms";
  afterHours?: boolean;
  contacted?: boolean;
  transcript?: string[];
  job?: JobSpec;
  /** Seed a real book_window proposal for this request, waiting for approval. */
  plan?: boolean;
};

export const DEMO_SAMPLE: Sample[] = [
  // Last week: calls that became paid work.
  { ago: 150, name: "Priya Shah", phone: "+13125550160", service: "AC not cooling, upstairs is 84 degrees", code: "hvac.no_cool", urgency: "same-day", address: "915 Hinman Ave, Evanston IL 60202", job: { tech: 0, when: -148, status: "completed", money: { kind: "paid", cents: 38_500 } } },
  { ago: 128, name: "Victor Alvarez", phone: "+13125550161", service: "Furnace making a banging noise", code: "hvac.no_heat", urgency: "this-week", address: "1123 Ridge Ave, Evanston IL 60201", job: { tech: 1, when: -104, status: "completed", money: { kind: "paid", cents: 46_000 } } },
  { ago: 80, name: "Elena Petrov", phone: "+13125550162", service: "Weak airflow in the back bedrooms", code: "hvac.airflow", urgency: "this-week", address: "1500 Chicago Ave, Evanston IL 60201", job: { tech: 2, when: -56, status: "completed", money: { kind: "paid", cents: 52_000 } } },
  // Billed, not paid yet.
  { ago: 54, name: "Rafael Ortiz", phone: "+13125550163", service: "Heat pump short cycling", code: "hvac.diagnostic", urgency: "this-week", address: "702 Main St, Evanston IL 60202", source: "sms", job: { tech: 1, when: -30, status: "completed", money: { kind: "billed", cents: 41_200 } } },
  // Done yesterday, nobody wrote the bill.
  { ago: 33, name: "Owen Brady", phone: "+13125550164", service: "Thermostat blank, no heat", code: "hvac.thermostat", urgency: "same-day", address: "1127 Davis St, Evanston IL 60201", job: { tech: 2, when: -22, status: "completed", money: { kind: "unbilled", cents: 24_500 } } },
  // A visit that passed without starting — recover it: contact, reschedule or close.
  { ago: 40, name: "Nina Hart", phone: "+13125550165", service: "Annual tune-up before winter", code: "hvac.maintenance", urgency: "flexible", address: "2400 Orrington Ave, Evanston IL 60201", job: { tech: 0, when: -20, status: "scheduled", confirmSent: true } },

  // Overnight: a gas smell, handled safely and sent to the owner.
  {
    ago: 9, name: "Tom Becker", phone: "+13125550166", service: "Smells gas near the furnace", code: "hvac.diagnostic", urgency: "emergency", address: "77 Main St, Evanston IL 60202", afterHours: true, contacted: true,
    transcript: [
      "AI: Summit Heating & Air, this is Orvius. What's going on?",
      "User: I smell gas near my furnace in the basement.",
      "AI: Please leave the home now, don't touch any switches, and call the gas company or 911 from outside.",
      "User: Okay, we're heading out.",
      "AI: What's the address so the owner can reach you?",
      "User: 77 Main Street, Evanston.",
      "AI: Thank you. I've marked this an emergency and alerted the owner. Stay outside until the gas company says it's safe.",
    ],
    job: { tech: 1, when: 24, status: "confirmed", title: "Gas smell follow-up after the utility clears it", customerConfirmed: true, techAccepted: true },
  },

  // Today's crew.
  { ago: 26, name: "Lena Novak", phone: "+13125550167", service: "No heat, furnace won't ignite", code: "hvac.no_heat", urgency: "same-day", address: "1840 Oak Ave, Evanston IL 60201", job: { tech: 2, when: -1, status: "on_site", customerConfirmed: true, techAccepted: true, quote: 36_000 } },
  { ago: 20, name: "Marcus Hill", phone: "+13125550168", service: "AC leaking water indoors", code: "hvac.condensate", urgency: "same-day", address: "620 Grove St, Evanston IL 60201", job: { tech: 0, when: 0.75, status: "en_route", customerConfirmed: true, techAccepted: true, quote: 29_500 } },
  { ago: 18, name: "Grace Kim", phone: "+13125550169", service: "Tune-up and filter change", code: "hvac.maintenance", urgency: "flexible", address: "2410 Orrington Ave, Evanston IL 60201", job: { tech: 0, when: 3, status: "confirmed", customerConfirmed: true, techAccepted: true } },
  // Waiting on the customer to confirm.
  { ago: 6, name: "Sam Rivera", phone: "+13125550170", service: "Furnace blowing cold air", code: "hvac.no_heat", urgency: "this-week", address: "915 Forest Ave, Evanston IL 60202", job: { tech: 2, when: 5, status: "scheduled", confirmSent: true } },
  // Tomorrow, nobody assigned yet.
  { ago: 5, name: "Ivy Chen", phone: "+13125550171", service: "Humidifier not running", code: "hvac.diagnostic", urgency: "this-week", address: "1301 Elmwood Ave, Evanston IL 60201", job: { tech: null, when: 26, status: "scheduled" } },
  // An estimate out, waiting for a yes.
  {
    ago: 4, name: "Helen Brooks", phone: "+13125550172", service: "Quote for a new furnace", code: "hvac.system_replace", urgency: "flexible", address: "311 Lake St, Evanston IL 60201",
    transcript: [
      "AI: Summit Heating & Air, this is Orvius. How can I help?",
      "User: Can I talk to a real person? I want a quote for a new furnace.",
      "AI: I can set that up — the owner does replacement quotes in person. What's the address?",
      "User: 311 Lake Street.",
      "AI: Thanks, Helen. I'll have the shop set a quote visit with you.",
    ],
    job: { tech: 1, when: 46, status: "scheduled", title: "Replacement quote visit", confirmSent: true, estimate: "sent", quote: 640_000 },
  },

  // A new request with everything needed — Orvius drafted the booking; it waits for approval.
  { ago: 1.5, name: "Jordan Lee", phone: "+13125550173", service: "AC making a grinding noise", code: "hvac.no_cool", urgency: "this-week", address: "1600 Hinman Ave, Evanston IL 60201", plan: true },
  // A new request to plan by asking Orvius.
  { ago: 1, name: "Carmen Diaz", phone: "+13125550174", service: "Furnace tune-up before the cold", code: "hvac.maintenance", urgency: "flexible", address: "820 Judson Ave, Evanston IL 60202" },
  // The caller dropped before giving an address — needs a person.
  {
    ago: 0.6, name: "Nora Walsh", phone: "+13125550175", service: "Water pooling under the furnace", code: "hvac.condensate", urgency: "same-day", address: null,
    transcript: [
      "AI: Summit Heating & Air, this is Orvius. What's going on?",
      "User: There's water pooling under my furnace.",
      "AI: I can get someone out today. What's the address?",
      "User: Sorry, I have to run — can someone call me back?",
      "AI: Of course. The shop will call you back.",
    ],
  },
];

const token = () => randomBytes(18).toString("base64url");

function transcriptFor(s: Sample, shop: string): string {
  if (s.transcript) return s.transcript.join("\n");
  return [
    `AI: ${shop}, this is Orvius. What's going on?`,
    `User: Hi, this is ${s.name}. ${s.service}.`,
    "AI: Sorry about that. What's the address for the visit?",
    `User: ${s.address}.`,
    "AI: Got it. You're booked for the open time we just set.",
  ].join("\n");
}

export type DemoSeedResult = { requests: number; jobs: number; proposals: number; collectedCents: number };

export async function seedDemoDataset(
  business: Pick<Business, "id" | "name" | "environment" | "timezone" | "hoursJson" | "servicesJson" | "trade" | "ownerPhone">,
  now = new Date(),
): Promise<DemoSeedResult> {
  if (business.environment !== "demo") throw new Error("Sample data only goes into a demo workspace.");
  const at = (hours: number) => new Date(now.getTime() + hours * H);
  const techs = await prisma.technician.findMany({ where: { businessId: business.id }, orderBy: { createdAt: "asc" }, omit: { appToken: true } });
  const planLeads: string[] = [];
  let jobs = 0;
  let collectedCents = 0;

  for (const [i, s] of DEMO_SAMPLE.entries()) {
    const created = at(-s.ago);
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: s.name,
        phone: s.phone,
        phoneNormalized: s.phone,
        address: s.address,
        firstSeenAt: created,
        lastSeenAt: created,
        createdAt: created,
      },
    });
    const viaCall = s.source !== "sms";
    const call = viaCall
      ? await prisma.call.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            vapiCallId: `demo_${business.id}_sample_${i}`,
            callerPhone: s.phone,
            status: "ended",
            durationSec: 120 + ((i * 37) % 140),
            summary: `${s.name}: ${s.service}.`,
            transcript: transcriptFor(s, business.name.replace(/ \(demo\)$/, "")),
            booked: Boolean(s.job) && s.urgency !== "emergency",
            ownerNotifiedAt: new Date(created.getTime() + 20_000),
            createdAt: created,
          },
        })
      : null;

    const demand = deriveDemandSignal({ serviceType: s.service, address: s.address, categoryHint: s.code, trade: "HVAC" });
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        callId: call?.id ?? null,
        externalId: `demo_sample_${i}`,
        name: s.name,
        phone: s.phone,
        serviceType: s.service,
        urgency: s.urgency,
        address: s.address,
        notes: s.afterHours ? "After hours" : null,
        status: s.job ? "booked" : s.contacted ? "contacted" : "new",
        source: viaCall ? "call" : "sms",
        categoryCode: demand.categoryCode,
        postalCode: demand.postalCode,
        firstContactedAt: s.contacted ? new Date(created.getTime() + 6 * 60_000) : null,
        createdAt: created,
      },
    });
    if (s.plan) planLeads.push(lead.id);

    await prisma.ownerNotification.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        channel: "sms",
        dedupeKey: `lead:${lead.id}`,
        status: "sent",
        businessName: business.name,
        message: `New ${s.urgency === "emergency" ? "EMERGENCY " : ""}request: ${s.name} · ${s.service}`,
        ownerPhone: business.ownerPhone,
        attempts: 1,
        deliveryStatus: "delivered",
        processedAt: new Date(created.getTime() + 18_000),
        createdAt: created,
      },
    });
    await prisma.auditEvent.create({
      data: {
        businessId: business.id,
        entityType: "lead",
        entityId: lead.id,
        action: "lead.captured",
        actor: "orvius",
        summary: `Captured ${s.name} · ${s.service}`,
        leadId: lead.id,
        customerId: customer.id,
        callId: call?.id ?? null,
        createdAt: created,
      },
    });

    if (!viaCall) {
      const thread = [
        { direction: "in", author: "customer", body: `Hi, ${s.service.toLowerCase()}. Can someone come out?`, at: 0 },
        { direction: "out", author: "orvius", body: `Thanks ${s.name.split(" ")[0]} — the shop got it and will text you a time shortly.`, at: 40_000 },
      ];
      for (const [n, m] of thread.entries()) {
        await prisma.message.create({
          data: {
            businessId: business.id,
            phoneNormalized: s.phone,
            direction: m.direction,
            author: m.author,
            body: m.body,
            sid: `demo_sample_msg_${business.id}_${i}_${n}`,
            deliveryStatus: m.direction === "out" ? "delivered" : null,
            readAt: m.direction === "in" ? new Date(created.getTime() + 5 * 60_000) : null,
            createdAt: new Date(created.getTime() + m.at),
          },
        });
      }
    }

    const spec = s.job;
    if (!spec) continue;
    jobs += 1;
    const scheduledAt = at(spec.when);
    const tech = spec.tech == null ? null : techs[spec.tech % Math.max(1, techs.length)] ?? null;
    const done = spec.status === "completed";
    const moving = spec.status === "en_route" || spec.status === "on_site";
    const customerConfirmed = done || moving || Boolean(spec.customerConfirmed);
    const confirmSent = customerConfirmed || Boolean(spec.confirmSent);
    const accepted = Boolean(tech) && (done || moving || Boolean(spec.techAccepted));
    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        leadId: lead.id,
        technicianId: tech?.id ?? null,
        title: spec.title ?? s.service,
        serviceType: s.service,
        urgency: s.urgency,
        address: s.address,
        categoryCode: lead.categoryCode,
        postalCode: lead.postalCode,
        status: spec.status,
        scheduledAt,
        durationMin: 90,
        techToken: done ? null : token(),
        customerConfirmToken: !done && confirmSent ? token() : null,
        confirmedAt: customerConfirmed ? new Date(created.getTime() + H) : null,
        customerConfirmSentAt: confirmSent ? new Date(created.getTime() + 30 * 60_000) : null,
        customerConfirmedAt: customerConfirmed ? new Date(created.getTime() + H) : null,
        techAssignedAt: tech ? new Date(created.getTime() + 5 * 60_000) : null,
        techNotifiedAt: tech ? new Date(created.getTime() + 5 * 60_000) : null,
        techAcceptedAt: accepted ? new Date(created.getTime() + 20 * 60_000) : null,
        dispatchedAt: moving || done ? new Date(scheduledAt.getTime() - 30 * 60_000) : null,
        onSiteAt: spec.status === "on_site" || done ? scheduledAt : null,
        completedAt: done ? new Date(scheduledAt.getTime() + 80 * 60_000) : null,
        finalAmountCents: done ? spec.money?.cents ?? null : null,
        outcomeCapturedAt: done ? new Date(scheduledAt.getTime() + 85 * 60_000) : null,
        resolutionSummary: done ? "Repaired and tested. Customer walked through the fix." : null,
        createdAt: created,
      },
    });
    await prisma.auditEvent.create({
      data: {
        businessId: business.id,
        entityType: "job",
        entityId: job.id,
        action: "job.booked",
        actor: "orvius",
        summary: `Booked ${job.title}${tech ? ` with ${tech.name}` : ""}`,
        leadId: lead.id,
        customerId: customer.id,
        jobId: job.id,
        createdAt: new Date(created.getTime() + 2 * 60_000),
      },
    });

    if (done && spec.money) {
      await prisma.auditEvent.create({
        data: {
          businessId: business.id,
          entityType: "job",
          entityId: job.id,
          action: "job.completed",
          actor: "teammate",
          summary: `${tech?.name ?? "The tech"} completed ${job.title}`,
          jobId: job.id,
          customerId: customer.id,
          createdAt: new Date(scheduledAt.getTime() + 80 * 60_000),
        },
      });
      if (spec.money.kind === "unbilled") continue;
      const billedAt = new Date(scheduledAt.getTime() + 90 * 60_000);
      const estimate = await prisma.estimate.create({
        data: { businessId: business.id, jobId: job.id, leadId: lead.id, amountCents: spec.money.cents, status: "accepted", acceptedAt: scheduledAt, createdAt: scheduledAt },
      });
      const paid = spec.money.kind === "paid";
      const invoice = await prisma.invoice.create({
        data: {
          businessId: business.id,
          estimateId: estimate.id,
          jobId: job.id,
          amountCents: spec.money.cents,
          status: paid ? "paid" : "sent",
          sentAt: billedAt,
          paidAt: paid ? billedAt : null,
          createdAt: billedAt,
        },
      });
      if (paid) {
        await prisma.payment.create({
          data: { businessId: business.id, invoiceId: invoice.id, amountCents: spec.money.cents, status: "succeeded", method: "card", createdAt: billedAt },
        });
        collectedCents += spec.money.cents;
      }
    } else if (spec.quote) {
      await prisma.estimate.create({
        data: {
          businessId: business.id,
          jobId: job.id,
          leadId: lead.id,
          amountCents: spec.quote,
          status: spec.estimate ?? "sent",
          sentAt: new Date(created.getTime() + H),
          createdAt: created,
        },
      });
    }
  }

  let proposals = 0;
  for (const leadId of planLeads) {
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    const [window] = await openWindows(business, { kind: "lead", lead }, 1);
    if (!window) continue;
    const proposed = await proposeAction(business, { action: "book_window", leadId, at: window.toISOString() });
    if (proposed.ok) proposals += 1;
  }

  return { requests: DEMO_SAMPLE.length, jobs, proposals, collectedCents };
}
