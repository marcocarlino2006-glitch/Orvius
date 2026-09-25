#!/usr/bin/env node
/**
 * Resets the Summit demo workspace to a normal day at a healthy shop, with every
 * time relative to now so the demo never ages into overdue jobs.
 *
 *   node scripts/demo-seed.mjs [--owner owner@example.com]
 *
 * What a prospect should see: a week of calls that became paid work, today's
 * crew moving, alerts delivered, an overnight gas call handled safely, and one
 * decision that genuinely needs the owner. Only ever touches environment=demo.
 */
import { randomBytes } from "node:crypto";
import { createScriptPrisma, loadEnvFile } from "./lib/db.mjs";

loadEnvFile();
const prisma = createScriptPrisma();

const ownerFlag = process.argv.indexOf("--owner");
const OWNER_EMAIL = (
  (ownerFlag > 0 ? process.argv[ownerFlag + 1] : null) ??
  process.env.ORVIUS_DEMO_OWNER_EMAIL ??
  "demo@orvius.local"
).toLowerCase();
const SLUG = "summit-hvac-demo";
const LINE = "+13125550199";
const TICKET = 42_000;

const now = Date.now();
const H = 3_600_000;
const at = (hours) => new Date(now + hours * H);

const crew = [
  { name: "Ana Ruiz", phone: "+13125550131", skills: ["cooling", "maintenance"] },
  { name: "Ben Okafor", phone: "+13125550132", skills: ["heating", "maintenance", "gas"] },
  { name: "Chris Lee", phone: "+13125550133", skills: ["airflow", "heating"] },
];

const script = (...lines) => lines.join("\n");
const token = () => randomBytes(18).toString("base64url");

/*
  Each entry is one request. `job` books it; `paid` completes and collects it;
  `status` is the job's live state for today's work.
*/
const requests = [
  // Last week: calls that became paid work.
  { ago: 150, name: "Maria Lopez", phone: "+13125550141", service: "AC not cooling, upstairs is 84 degrees", code: "hvac.no_cool", urgency: "same-day", address: "418 Elm St, Evanston IL 60201", job: { tech: 0, when: -148, status: "completed", paid: 38_500 } },
  { ago: 128, name: "James Carter", phone: "+13125550142", service: "Furnace making a banging noise", code: "hvac.no_heat", urgency: "this-week", address: "2210 Ridge Ave, Evanston IL 60201", job: { tech: 1, when: -104, status: "completed", paid: 46_000 } },
  { ago: 101, name: "Priya Shah", phone: "+13125550143", service: "Annual tune-up before winter", code: "hvac.maintenance", urgency: "flexible", address: "915 Hinman Ave, Evanston IL 60202", job: { tech: 0, when: -77, status: "completed", paid: 18_900 } },
  { ago: 80, name: "Dana Whitfield", phone: "+13125550146", service: "Weak airflow in the back bedrooms", code: "hvac.airflow", urgency: "this-week", address: "1500 Chicago Ave, Evanston IL 60201", job: { tech: 2, when: -56, status: "completed", paid: 52_000 } },
  { ago: 54, name: "Rosa Diaz", phone: "+13125550147", service: "Heat pump short cycling", code: "hvac.diagnostic", urgency: "this-week", address: "702 Main St, Evanston IL 60202", source: "sms", job: { tech: 1, when: -30, status: "completed", paid: 41_200 } },
  { ago: 33, name: "Owen Park", phone: "+13125550148", service: "Thermostat blank, no heat", code: "hvac.thermostat", urgency: "same-day", address: "1127 Davis St, Evanston IL 60201", job: { tech: 2, when: -28, status: "completed", paid: 24_500 } },

  // Overnight: a gas smell, handled safely and sent to the owner.
  {
    ago: 9, name: "Tom Becker", phone: "+13125550144", service: "Smells gas near the furnace", code: "hvac.diagnostic", urgency: "emergency", address: "77 Main St, Evanston IL 60202", afterHours: true, contacted: true,
    transcript: script(
      "AI: Summit Heating & Air, this is Orvius. What's going on?",
      "User: I smell gas near my furnace in the basement.",
      "AI: Please leave the house now with everyone inside, and don't flip any switches. From outside, call the gas company or 911.",
      "User: Okay, we're heading out.",
      "AI: What's the address so the owner can reach you?",
      "User: 77 Main Street, Evanston.",
      "AI: Thank you. I've marked this an emergency and texted the owner right now. Stay outside until the gas company says it's safe.",
    ),
    job: { tech: 1, when: 2, status: "confirmed", title: "Gas smell inspection after utility clears", quote: 18_500 },
  },

  // Today's crew.
  { ago: 26, name: "Lena Novak", phone: "+13125550145", service: "No heat, furnace won't ignite", code: "hvac.no_heat", urgency: "same-day", address: "1840 Oak Ave, Evanston IL 60201", job: { tech: 2, when: -1.5, status: "on_site", quote: 36_000 } },
  { ago: 20, name: "Marcus Hill", phone: "+13125550149", service: "AC leaking water indoors", code: "hvac.condensate", urgency: "same-day", address: "620 Grove St, Evanston IL 60201", job: { tech: 0, when: 0.75, status: "en_route", quote: 29_500 } },
  { ago: 18, name: "Grace Kim", phone: "+13125550150", service: "Tune-up and filter change", code: "hvac.maintenance", urgency: "flexible", address: "2400 Orrington Ave, Evanston IL 60201", job: { tech: 0, when: 3.5, status: "confirmed", quote: 16_900 } },
  { ago: 6, name: "Sam Rivera", phone: "+13125550151", service: "Furnace blowing cold air", code: "hvac.no_heat", urgency: "this-week", address: "915 Forest Ave, Evanston IL 60202", job: { tech: 2, when: 22, status: "scheduled", confirmSent: true, quote: 34_000 } },

  // A caller who wanted a person — handled, but worth a listen.
  {
    ago: 4, name: "Helen Brooks", phone: "+13125550152", service: "Quote for a new furnace", code: "hvac.system_replace", urgency: "flexible", address: "311 Lake St, Evanston IL 60201",
    transcript: script(
      "AI: Summit Heating & Air, this is Orvius. How can I help?",
      "User: Can I talk to a real person? I want a quote for a new furnace.",
      "AI: I can set that up. The owner does replacement quotes in person. What's the address?",
      "User: 311 Lake Street.",
      "AI: Thanks, Helen. I've booked a quote visit for Thursday morning and the owner has your number.",
    ),
    job: { tech: 1, when: 44, status: "scheduled", confirmSent: true, title: "Replacement quote visit" },
  },

  // The one decision that needs the owner: the caller dropped before giving an address.
  {
    ago: 0.6, name: "Nora Walsh", phone: "+13125550153", service: "Water pooling under the furnace", code: "hvac.condensate", urgency: "same-day", address: null,
    transcript: script(
      "AI: Summit Heating & Air, this is Orvius. What's going on?",
      "User: There's water pooling under my furnace.",
      "AI: I can get someone out today. What's the address?",
      "User: Sorry, I have to run — can someone call me back?",
      "AI: Of course. The owner will call you back shortly.",
    ),
  },
];

function transcriptFor(r) {
  if (r.transcript) return r.transcript;
  return script(
    "AI: Summit Heating & Air, this is Orvius. What's going on?",
    `User: Hi, this is ${r.name}. ${r.service}.`,
    "AI: Sorry about that. What's the address for the visit?",
    `User: ${r.address}.`,
    "AI: Got it. You're booked, and you'll get a text to confirm the time.",
  );
}

async function reset() {
  const old = await prisma.business.findMany({
    where: { OR: [{ slug: SLUG }, { environment: "demo", ownerEmail: OWNER_EMAIL }] },
    select: { id: true, environment: true, slug: true },
  });
  for (const b of old) {
    if (b.environment !== "demo" && b.slug !== SLUG) continue;
    await prisma.business.delete({ where: { id: b.id } });
  }
}

async function main() {
  await reset();
  const business = await prisma.business.create({
    data: {
      name: "Summit Heating & Air",
      slug: SLUG,
      environment: "demo",
      autopilot: true,
      trade: "HVAC",
      ownerEmail: OWNER_EMAIL,
      ownerPhone: "+13125550100",
      phone: "+13125550100",
      address: "1200 Central St, Evanston IL 60201",
      timezone: "America/Chicago",
      hoursJson: "{}",
      servicesJson: JSON.stringify([{ name: "Furnace repair" }, { name: "AC repair" }, { name: "Tune-ups" }, { name: "Replacements" }]),
      serviceZipsJson: JSON.stringify(["60201", "60202", "60203"]),
      greeting: "Summit Heating & Air, this is Orvius. What's going on?",
      twilioPhone: LINE,
      vapiPhoneNumber: LINE,
      lineVerifiedAt: at(-24 * 30),
      overflowForwardConfirmedAt: at(-24 * 29),
      overflowProvedAt: at(-24 * 29),
      captureMode: "forward",
      billingStatus: "active",
      billingPlan: "pro",
      avgTicketCents: TICKET,
      baselineMissedCallsPerWeek: 9,
      baselineJobsPerWeek: 11,
      lastWeeklyProofAt: at(-50),
      createdAt: at(-24 * 30),
    },
  });

  const techs = [];
  for (const t of crew) {
    techs.push(
      await prisma.technician.create({
        data: { businessId: business.id, name: t.name, phone: t.phone, skillsJson: JSON.stringify(t.skills) },
      }),
    );
  }

  let collected = 0;
  for (const [i, r] of requests.entries()) {
    const created = at(-r.ago);
    const customer = await prisma.customer.create({
      data: {
        businessId: business.id,
        name: r.name,
        phone: r.phone,
        phoneNormalized: r.phone,
        address: r.address,
        firstSeenAt: created,
        lastSeenAt: created,
        createdAt: created,
      },
    });
    const viaCall = r.source !== "sms";
    const call = viaCall
      ? await prisma.call.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            vapiCallId: `demo_${SLUG}_${i}`,
            callerPhone: r.phone,
            status: "ended",
            durationSec: 120 + ((i * 37) % 140),
            summary: `${r.name}: ${r.service}.`,
            transcript: transcriptFor(r),
            booked: Boolean(r.job) && r.urgency !== "emergency",
            ownerNotifiedAt: new Date(created.getTime() + 20_000),
            createdAt: created,
          },
        })
      : null;

    const leadStatus = r.job ? "booked" : r.contacted ? "contacted" : "new";
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        callId: call?.id ?? null,
        externalId: `demo_${i}`,
        name: r.name,
        phone: r.phone,
        serviceType: r.service,
        urgency: r.urgency,
        address: r.address,
        notes: r.afterHours ? "After hours" : null,
        status: leadStatus,
        source: viaCall ? "call" : "sms",
        categoryCode: r.code,
        postalCode: r.address?.match(/\d{5}$/)?.[0] ?? null,
        firstContactedAt: r.contacted ? new Date(created.getTime() + 6 * 60_000) : null,
        createdAt: created,
      },
    });

    await prisma.ownerNotification.create({
      data: {
        businessId: business.id,
        leadId: lead.id,
        channel: "sms",
        dedupeKey: `lead:${lead.id}`,
        status: "sent",
        businessName: business.name,
        message: `New ${r.urgency === "emergency" ? "EMERGENCY " : ""}lead: ${r.name} · ${r.service}`,
        ownerPhone: business.ownerPhone,
        attempts: 1,
        deliveryStatus: "delivered",
        processedAt: new Date(created.getTime() + 18_000),
        createdAt: created,
      },
    });

    if (!r.job) continue;
    const scheduledAt = at(r.job.when);
    const tech = techs[r.job.tech];
    const done = r.job.status === "completed";
    const moving = r.job.status === "en_route" || r.job.status === "on_site";
    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        leadId: lead.id,
        technicianId: tech.id,
        title: r.job.title ?? r.service,
        serviceType: r.service,
        urgency: r.urgency,
        address: r.address,
        categoryCode: r.code,
        postalCode: lead.postalCode,
        status: r.job.status,
        scheduledAt,
        durationMin: 90,
        techToken: done ? null : token(),
        customerConfirmToken: !done && (r.job.status !== "scheduled" || r.job.confirmSent) ? token() : null,
        confirmedAt: r.job.status !== "scheduled" ? new Date(created.getTime() + H) : null,
        customerConfirmSentAt: r.job.status !== "scheduled" || r.job.confirmSent ? new Date(created.getTime() + 30 * 60_000) : null,
        customerConfirmedAt: r.job.status !== "scheduled" ? new Date(created.getTime() + H) : null,
        dispatchedAt: moving || done ? new Date(scheduledAt.getTime() - 30 * 60_000) : null,
        onSiteAt: r.job.status === "on_site" || done ? scheduledAt : null,
        completedAt: done ? new Date(scheduledAt.getTime() + 80 * 60_000) : null,
        finalAmountCents: done ? r.job.paid : null,
        outcomeCapturedAt: done ? new Date(scheduledAt.getTime() + 85 * 60_000) : null,
        resolutionSummary: done ? "Repaired and tested. Customer walked through the fix." : null,
        createdAt: created,
      },
    });

    if (done) {
      const paidAt = new Date(scheduledAt.getTime() + 90 * 60_000);
      const estimate = await prisma.estimate.create({
        data: { businessId: business.id, jobId: job.id, leadId: lead.id, amountCents: r.job.paid, status: "accepted", acceptedAt: scheduledAt, createdAt: scheduledAt },
      });
      const invoice = await prisma.invoice.create({
        data: { businessId: business.id, estimateId: estimate.id, jobId: job.id, amountCents: r.job.paid, status: "paid", createdAt: paidAt },
      });
      await prisma.payment.create({
        data: { businessId: business.id, invoiceId: invoice.id, amountCents: r.job.paid, status: "succeeded", method: "card", createdAt: paidAt },
      });
      collected += r.job.paid;
    } else if (r.job.quote) {
      await prisma.estimate.create({
        data: { businessId: business.id, jobId: job.id, leadId: lead.id, amountCents: r.job.quote, status: "sent", createdAt: created },
      });
    }
  }

  console.log(
    `✅ ${business.name} reset for ${OWNER_EMAIL}: ${requests.length} requests, ${crew.length} techs, $${(collected / 100).toLocaleString()} collected this week`,
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
