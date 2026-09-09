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

const AUDIT_EMAIL = "contrast-audit@orvius.invalid";

async function getPrisma() {
  const { createScriptPrisma } = await import("./lib/db.mjs");
  return createScriptPrisma();
}

/** A shop with enough on it that list views render rows, not empty states. */
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

  const existingJob = await prisma.job.findFirst({
    where: { businessId: business.id },
  });
  if (existingJob) {
    const call = await prisma.call.findFirst({ where: { businessId: business.id } });
    const lead = await prisma.lead.findFirst({ where: { businessId: business.id } });
    const customer = await prisma.customer.findFirst({
      where: { businessId: business.id },
    });
    return {
      business,
      jobId: existingJob.id,
      callId: call?.id ?? null,
      leadId: lead?.id ?? null,
      customerId: customer?.id ?? null,
    };
  }

  const customer = await prisma.customer.create({
    data: {
      businessId: business.id,
      name: "Audit Customer",
      phone: "+15555550199",
      phoneNormalized: "+15555550199",
      address: "100 Test Row, Denver, CO 80202",
    },
  });

  const call = await prisma.call.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      callerPhone: "+15555550199",
      status: "completed",
      durationSec: 132,
      booked: true,
      summary: "No heat on a rooftop unit. Captured the address and a window.",
      transcript: "Caller: no heat upstairs.\nOrvius: I can get someone out.",
      ownerNotifiedAt: new Date(),
    },
  });

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      callId: call.id,
      name: "Audit Customer",
      phone: "+15555550199",
      serviceType: "No heat",
      urgency: "emergency",
      address: "100 Test Row, Denver, CO 80202",
      status: "booked",
      firstContactedAt: new Date(),
    },
  });

  const job = await prisma.job.create({
    data: {
      businessId: business.id,
      customerId: customer.id,
      leadId: lead.id,
      title: "No heat — rooftop unit",
      serviceType: "No heat",
      urgency: "emergency",
      address: "100 Test Row, Denver, CO 80202",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 3_600_000),
    },
  });

  return {
    business,
    jobId: job.id,
    callId: call.id,
    leadId: lead.id,
    customerId: customer.id,
  };
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
