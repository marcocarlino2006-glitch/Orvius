/**
 * Signs a Puppeteer page into a disposable owner account, so audits can reach
 * the product instead of stopping at the marketing site.
 *
 * The dashboard is where an owner actually spends the night, and until now no
 * audit could see it: every route funnels to onboarding without a shop, and
 * sign-in needs a mailbox. So this mints a login token straight into the table
 * the way the issuer would, rather than going through the HTTP route — the
 * production route rate-limits to three links per quarter hour, which is
 * correct for owners and useless for a script that runs on every check.
 *
 * The fixture shop is owned by an address on a reserved TLD that cannot receive
 * mail, is reused across runs rather than piling up, and exists only in the
 * local dev database. Nothing here ships to a customer.
 */
const { createHash, randomBytes } = require("node:crypto");
const { fixtureRecording } = require("./lib/fixture-audio.cjs");

const AUDIT_EMAIL = "contrast-audit@orvius.invalid";

async function getPrisma() {
  const { createScriptPrisma } = await import("./lib/db.mjs");
  return createScriptPrisma();
}

/*
  A week of work, not one row of it.

  This fixture used to hold a single customer, call, lead and job — enough to
  prove a list renders, and useless for judging one. Every screen came out as a
  header, one row, and two thirds of a blank page, so a design that falls apart
  at thirty leads looked identical to one that holds. Dead-fold and density
  measurements taken against it measured the fixture, not the product.

  So: eight customers, three techs, and a fortnight of calls weighted toward
  the hours we exist for, with leads at every status and jobs at every pipeline
  stage. All of it derived from a fixed table below rather than randomised, so
  two runs of the same audit are comparable.
*/
const CREW = [
  { name: "Ray Delgado", phone: "+15555550141" },
  { name: "Marcus Hale", phone: "+15555550142" },
  { name: "Tasha Brandt", phone: "+15555550143" },
];

const PEOPLE = [
  { name: "Dana Whitfield", phone: "+15555550191", address: "418 Quarry Rd, Denver, CO 80209" },
  { name: "Errol Simms", phone: "+15555550192", address: "77 Halsted Ct, Denver, CO 80211" },
  { name: "Priya Raman", phone: "+15555550193", address: "2201 Kalmia Ave, Denver, CO 80207" },
  { name: "Boyd Castellano", phone: "+15555550194", address: "9 Ironwood Ln, Aurora, CO 80012" },
  { name: "Neva Okonjo", phone: "+15555550195", address: "1450 Fenton St, Lakewood, CO 80214" },
  { name: "Hal Bergstrom", phone: "+15555550196", address: "630 Pecos Way, Denver, CO 80204" },
  { name: "Junie Alvarez", phone: "+15555550197", address: "88 Tallgrass Cir, Golden, CO 80401" },
  { name: "Wes Trahan", phone: "+15555550198", address: "3 Mill Bend, Arvada, CO 80003" },
  { name: "Corinne Vash", phone: "+15555550181", address: "512 Alcott St, Denver, CO 80211" },
  { name: "Dell Marchetti", phone: "+15555550182", address: "1907 Vine St, Denver, CO 80206" },
  { name: "Simone Arbuckle", phone: "+15555550183", address: "44 Coalbank Dr, Littleton, CO 80120" },
  { name: "Otis Frayne", phone: "+15555550184", address: "225 Sherrelwood Pl, Denver, CO 80221" },
  { name: "Marisol Quint", phone: "+15555550185", address: "71 Belleview Rise, Englewood, CO 80110" },
];

/*
  hoursAgo is the spine: it puts each call at a real hour of a real night, which
  is what the after-hours count on /calls is derived from. The clock hours here
  land outside 8am–6pm for the majority, because that is the shop's actual week.
*/
const CALLS = [
  { who: 0, hoursAgo: 3, dur: 148, booked: true, service: "No heat", urgency: "emergency", status: "new",
    summary: "Furnace out, two kids in the house. Took the address and held a 9pm window.",
    transcript: "Caller: the furnace just quit and it's getting cold.\nOrvius: I can get a tech out tonight. What's the address?\nCaller: 418 Quarry Road.\nOrvius: Booked for 9pm. You'll get a text with the tech's name." },
  { who: 1, hoursAgo: 9, dur: 96, booked: true, service: "Water heater leak", urgency: "emergency", status: "contacted",
    summary: "Water heater weeping at the base. Advised shutoff, booked first thing.",
    transcript: "Caller: there's water all around the tank.\nOrvius: Shut the cold inlet on top — the handle above it.\nCaller: got it.\nOrvius: First slot tomorrow is 7:30am." },
  { who: 2, hoursAgo: 20, dur: 212, booked: true, service: "AC not cooling", urgency: "urgent", status: "booked",
    summary: "Condenser running, no cold air. Suspect low charge. Booked Thursday.",
    transcript: "Caller: the outside unit hums but the vents are warm.\nOrvius: Sounds like charge or a capacitor. Thursday morning work?" },
  { who: 3, hoursAgo: 27, dur: 64, booked: false, service: "Quote request", urgency: "routine", status: "lost",
    summary: "Price shopping a full system swap. Wanted a number over the phone.",
    transcript: "Caller: what's a new system run?\nOrvius: It depends on tonnage — I can get you a real quote on site." },
  { who: 4, hoursAgo: 33, dur: 181, booked: true, service: "Drain backup", urgency: "emergency", status: "booked",
    summary: "Kitchen line backing into the basement. Emergency call, tech dispatched.",
    transcript: "Caller: it's coming up in the floor drain.\nOrvius: Stop running water. Tech is 40 minutes out." },
  { who: 5, hoursAgo: 41, dur: 118, booked: true, service: "Thermostat replacement", urgency: "routine", status: "booked",
    summary: "Wants a smart thermostat installed. Flexible on timing.",
    transcript: "Caller: can you put in one of the Nest ones?\nOrvius: Yes. Friday afternoon?" },
  { who: 0, hoursAgo: 50, dur: 87, booked: false, service: "Follow-up", urgency: "routine", status: "contacted",
    summary: "Checking whether the part came in. Told her Tuesday.",
    transcript: "Caller: any word on the blower motor?\nOrvius: It's on the truck Tuesday." },
  { who: 6, hoursAgo: 56, dur: 203, booked: true, service: "Furnace maintenance", urgency: "routine", status: "booked",
    summary: "Annual tune-up before the cold. Booked for the following week.",
    transcript: "Caller: I'd like the yearly service done.\nOrvius: Next Wednesday, 10am." },
  { who: 7, hoursAgo: 64, dur: 44, booked: false, service: "Wrong number", urgency: "routine", status: "spam",
    summary: "Asked for a roofer. Told them we do HVAC and plumbing.",
    transcript: "Caller: is this about the roof?\nOrvius: No — heating, cooling and plumbing." },
  { who: 1, hoursAgo: 72, dur: 156, booked: true, service: "No hot water", urgency: "urgent", status: "booked",
    summary: "Pilot won't hold. Walked through a relight, still out. Booked morning.",
    transcript: "Caller: no hot water at all.\nOrvius: Try the relight sequence on the label.\nCaller: it won't catch.\nOrvius: Thermocouple, most likely. 8am tomorrow." },
  { who: 2, hoursAgo: 80, dur: 131, booked: true, service: "Frozen pipe", urgency: "emergency", status: "booked",
    summary: "Outside spigot line frozen overnight. Dispatched same night.",
    transcript: "Caller: nothing's coming out of the hose bib.\nOrvius: Don't use a torch. I've got a tech heading over." },
  { who: 8, hoursAgo: 94, dur: 72, booked: false, service: "Rebate question", urgency: "routine", status: "contacted",
    summary: "Asked about the heat-pump rebate. Sent the link.",
    transcript: "Caller: is there still money back on heat pumps?\nOrvius: There is. I'll text you the form." },
  { who: 9, hoursAgo: 103, dur: 167, booked: true, service: "Blower noise", urgency: "urgent", status: "booked",
    summary: "Grinding from the air handler. Told her to shut it off at the breaker.",
    transcript: "Caller: it sounds like a coffee grinder up there.\nOrvius: Kill it at the breaker so the bearing doesn't seize." },
  { who: 10, hoursAgo: 117, dur: 58, booked: false, service: "Callback", urgency: "routine", status: "new",
    summary: "Left a voicemail for the owner about scheduling. Needs a human callback.",
    transcript: "Caller: I'd rather talk to Mike directly.\nOrvius: I'll have him call you in the morning." },
  { who: 11, hoursAgo: 128, dur: 189, booked: true, service: "Zone valve", urgency: "urgent", status: "booked",
    summary: "Upstairs zone stuck closed. Diagnosed over the phone, booked.",
    transcript: "Caller: the second floor never gets warm.\nOrvius: Zone valve or the head on it. Tuesday 1pm." },
  { who: 12, hoursAgo: 140, dur: 111, booked: true, service: "Sump pump", urgency: "urgent", status: "booked",
    summary: "Pump cycling constantly ahead of the storm. Booked next day.",
    transcript: "Caller: it won't stop running.\nOrvius: Float switch. I can have someone there tomorrow." },
];

/*
  Jobs carry an explicit day offset so the dispatch board — which only ever
  shows one date — has something on it, including one job with nobody driving
  to it. Negative offsets are finished work.
*/
const JOBS = [
  { who: 0, dayOffset: 0, hour: 21, status: "scheduled", tech: 0, title: "No heat — furnace lockout", service: "No heat", urgency: "emergency" },
  { who: 4, dayOffset: 0, hour: 14, status: "en_route", tech: 1, title: "Drain backup — kitchen stack", service: "Drain backup", urgency: "emergency" },
  { who: 2, dayOffset: 0, hour: 16, status: "scheduled", tech: null, title: "AC not cooling — low charge", service: "AC not cooling", urgency: "urgent" },
  { who: 5, dayOffset: 1, hour: 13, status: "scheduled", tech: 2, title: "Thermostat swap — smart stat", service: "Thermostat replacement", urgency: "routine" },
  { who: 1, dayOffset: 1, hour: 8, status: "confirmed", tech: 0, title: "Water heater — thermocouple", service: "No hot water", urgency: "urgent" },
  { who: 6, dayOffset: 3, hour: 10, status: "scheduled", tech: 1, title: "Furnace maintenance — annual", service: "Furnace maintenance", urgency: "routine" },
  { who: 9, dayOffset: -1, hour: 11, status: "on_site", tech: 2, title: "Blower motor — bearing failure", service: "Blower noise", urgency: "urgent" },
  { who: 12, dayOffset: -2, hour: 9, status: "completed", tech: 0, title: "Sump pump — float switch", service: "Sump pump", urgency: "urgent", finalCents: 38500 },
  { who: 2, dayOffset: -4, hour: 15, status: "completed", tech: 1, title: "Frozen hose bib — thaw and wrap", service: "Frozen pipe", urgency: "emergency", finalCents: 24000, estimateCents: 24000, invoiced: true },
  { who: 11, dayOffset: -6, hour: 12, status: "completed", tech: 2, title: "Zone valve head replacement", service: "Zone valve", urgency: "urgent", finalCents: 46500, estimateCents: 46500 },
];

function atDay(dayOffset, hour) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** Every fixture row this shop owns, in an order the foreign keys tolerate. */
async function clearFixture(prisma, businessId) {
  await prisma.payment.deleteMany({ where: { businessId } });
  await prisma.invoice.deleteMany({ where: { businessId } });
  await prisma.estimate.deleteMany({ where: { businessId } });
  await prisma.job.deleteMany({ where: { businessId } });
  await prisma.lead.deleteMany({ where: { businessId } });
  await prisma.call.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.technician.deleteMany({ where: { businessId } });
}

async function buildWeek(prisma, business) {
  await clearFixture(prisma, business.id);

  const crew = [];
  for (const tech of CREW) {
    crew.push(
      await prisma.technician.create({
        data: { businessId: business.id, name: tech.name, phone: tech.phone },
      }),
    );
  }

  /* interactionCount drives the "returning" badge, so it is set from the number
     of calls each person actually appears in below rather than guessed. */
  const callsPerPerson = PEOPLE.map(
    (_, index) => CALLS.filter((call) => call.who === index).length,
  );

  const customers = [];
  for (const [index, person] of PEOPLE.entries()) {
    customers.push(
      await prisma.customer.create({
        data: {
          businessId: business.id,
          name: person.name,
          phone: person.phone,
          phoneNormalized: person.phone,
          address: person.address,
          interactionCount: Math.max(1, callsPerPerson[index]),
          firstSeenAt: atDay(-13, 9),
          lastSeenAt: new Date(),
        },
      }),
    );
  }

  const calls = [];
  const leads = [];
  for (const [index, row] of CALLS.entries()) {
    const person = PEOPLE[row.who];
    const customer = customers[row.who];
    const at = new Date(Date.now() - row.hoursAgo * 3_600_000);

    /*
      Audio on the recent calls only. Every one would be ~30MB of synthesised
      PCM for a fixture, and the calls a review actually opens are the ones at
      the top of the list. The rest keep a null recordingUrl, which is also the
      state a real shop is in whenever Vapi has not posted the file back yet —
      worth having on screen somewhere.
    */
    const call = await prisma.call.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        callerPhone: person.phone,
        status: "completed",
        durationSec: row.dur,
        booked: row.booked,
        summary: row.summary,
        transcript: row.transcript,
        recordingUrl: index < 5 ? fixtureRecording(row.dur, index + 1) : null,
        ownerNotifiedAt: at,
        createdAt: at,
      },
    });
    calls.push(call);

    leads.push(
      await prisma.lead.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          callId: call.id,
          name: person.name,
          phone: person.phone,
          serviceType: row.service,
          urgency: row.urgency,
          address: person.address,
          status: row.status,
          source: "call",
          firstContactedAt: row.status === "new" ? null : at,
          createdAt: at,
        },
      }),
    );
  }

  const jobs = [];
  for (const row of JOBS) {
    const customer = customers[row.who];
    const scheduledAt = atDay(row.dayOffset, row.hour);
    const done = row.status === "completed";

    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        technicianId: row.tech === null ? null : crew[row.tech].id,
        title: row.title,
        serviceType: row.service,
        urgency: row.urgency,
        address: PEOPLE[row.who].address,
        status: row.status,
        scheduledAt,
        confirmedAt: row.status === "confirmed" ? scheduledAt : null,
        completedAt: done ? scheduledAt : null,
        finalAmountCents: row.finalCents ?? null,
        outcomeCapturedAt: done ? scheduledAt : null,
        createdAt: scheduledAt,
      },
    });
    jobs.push(job);

    if (!row.estimateCents) continue;

    const estimate = await prisma.estimate.create({
      data: {
        businessId: business.id,
        jobId: job.id,
        amountCents: row.estimateCents,
        status: row.invoiced ? "accepted" : "sent",
        sentAt: scheduledAt,
        acceptedAt: row.invoiced ? scheduledAt : null,
      },
    });

    if (row.invoiced) {
      await prisma.invoice.create({
        data: {
          businessId: business.id,
          estimateId: estimate.id,
          jobId: job.id,
          amountCents: row.estimateCents,
          status: "sent",
        },
      });
    }
  }

  return {
    business,
    jobId: jobs[0].id,
    callId: calls[0].id,
    leadId: leads[0].id,
    customerId: customers[0].id,
  };
}

/** A shop with a realistic week on it, so list views can actually be judged. */
async function ensureFixture(prisma) {
  let business = await prisma.business.findFirst({
    where: { ownerEmail: AUDIT_EMAIL },
  });

  if (!business) {
    business = await prisma.business.create({
      data: {
        name: "Contrast Audit HVAC",
        slug: `contrast-audit-${randomBytes(4).toString("hex")}`,
        ownerEmail: AUDIT_EMAIL,
        ownerPhone: "+15555550123",
        phone: "+15555550100",
        twilioPhone: "+15555550100",
        timezone: "America/Denver",
        avgTicketCents: 42000,
        /* Verified and confirmed, so setup banners do not cover the surfaces
           the audit is here to measure. */
        lineVerifiedAt: new Date(),
        overflowForwardConfirmedAt: new Date(),
      },
    });
  }

  /*
    Rebuilt whenever the week has drifted out from under it. The dispatch board
    only renders one date, so a fixture seeded yesterday shows an empty board
    today — which is exactly the state a screenshot must not be taken in.
  */
  const [callCount, customerCount, todayJob] = await Promise.all([
    prisma.call.count({ where: { businessId: business.id } }),
    prisma.customer.count({ where: { businessId: business.id } }),
    prisma.job.findFirst({
      where: {
        businessId: business.id,
        scheduledAt: { gte: atDay(0, 0), lt: atDay(1, 0) },
      },
    }),
  ]);

  /* Editing the tables above is how this fixture changes, and an edit that keeps
     the row counts identical — renaming a caller, moving a job to another tech —
     is invisible to the checks below. This is the lever for those. */
  const forced = process.env.ORVIUS_FIXTURE_REBUILD === "1";

  if (
    !forced &&
    callCount >= CALLS.length &&
    customerCount >= PEOPLE.length &&
    todayJob
  ) {
    const [call, lead, customer] = await Promise.all([
      prisma.call.findFirst({ where: { businessId: business.id } }),
      prisma.lead.findFirst({ where: { businessId: business.id } }),
      prisma.customer.findFirst({ where: { businessId: business.id } }),
    ]);
    return {
      business,
      jobId: todayJob.id,
      callId: call?.id ?? null,
      leadId: lead?.id ?? null,
      customerId: customer?.id ?? null,
    };
  }

  return buildWeek(prisma, business);
}

/** Mint a token the issuer would accept, then let the app redeem it. */
async function mintToken(prisma) {
  const token = randomBytes(32).toString("base64url");
  await prisma.loginToken.create({
    data: {
      email: AUDIT_EMAIL,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    },
  });
  return token;
}

/**
 * Establishes a session on `page` and returns the fixture ids, or null when the
 * allowlist excludes the audit address — a configured deployment should not be
 * silently auditable.
 */
async function signInForAudit(page, base) {
  const allowed = process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.trim();
  if (allowed && !allowed.toLowerCase().includes(AUDIT_EMAIL)) return null;

  const prisma = await getPrisma();
  try {
    const fixture = await ensureFixture(prisma);
    const token = await mintToken(prisma);

    await page.goto(`${base}/signin/verify?token=${token}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    /* The verify view redeems the token and then redirects; wait for it to
       leave rather than assuming how long the exchange takes. */
    for (let i = 0; i < 60 && page.url().includes("/signin/verify"); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (page.url().includes("/signin/verify")) return null;
    return fixture;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

module.exports = { signInForAudit, AUDIT_EMAIL };
