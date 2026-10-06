import { getWebhookUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { BUSINESS_TYPES, type TextingDetails } from "@/lib/shop-texting-copy";
import { getTwilioClient } from "@/lib/twilio-client";

/*
  Every shop already has its own number and its own receptionist. This makes
  its texts come from that number too.

  US carriers drop business texts from a local number unless the business is
  registered (A2P 10DLC): a business profile, a brand, and an approved campaign
  describing what it texts. Orvius registers each shop through Twilio's ISV
  flow — secondary customer profile, A2P trust bundle, brand, messaging service
  with the shop's number, campaign — one step per pass of the 30-minute cron,
  because each review takes minutes to weeks. Until the campaign is approved,
  the shop's texts keep going out from the shared Orvius sender, so nothing
  stops while it waits.
*/

const SECONDARY_PROFILE_POLICY = "RNdfbf3fae0e1107f8aded0e7cead80bf5";
const A2P_PROFILE_POLICY = "RNb0d4771c2c98518d916a3d4cd70a8f8b";

export { BUSINESS_TYPES, TEXTING_STATUS_COPY, type TextingDetails, type TextingStatus } from "@/lib/shop-texting-copy";

export function textingRegistrationAvailable() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID?.trim(),
  );
}

const digits = (v: string) => v.replace(/\D/g, "");

function e164(v: string) {
  const d = digits(v);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/** Carriers reject on any of these, so they are checked before anything is sent. */
export function validateTextingDetails(input: Partial<Record<keyof TextingDetails, unknown>>):
  | { ok: true; details: TextingDetails }
  | { ok: false; errors: Partial<Record<keyof TextingDetails, string>> } {
  const s = (k: keyof TextingDetails) => (typeof input[k] === "string" ? (input[k] as string).trim().slice(0, 200) : "");
  const errors: Partial<Record<keyof TextingDetails, string>> = {};
  const legalName = s("legalName");
  if (legalName.length < 2) errors.legalName = "The name on your IRS paperwork.";
  const businessType = s("businessType") as TextingDetails["businessType"];
  if (!BUSINESS_TYPES.includes(businessType)) errors.businessType = "Pick one.";
  const einDigits = digits(s("ein"));
  if (einDigits.length !== 9) errors.ein = "Nine digits, like 12-3456789. Carriers require it.";
  let website = s("website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(website)) errors.website = "A site or public page customers can find you on.";
  const street = s("street");
  if (street.length < 3) errors.street = "Street address.";
  const city = s("city");
  if (city.length < 2) errors.city = "City.";
  const region = s("region").toUpperCase();
  if (!/^[A-Z]{2}$/.test(region)) errors.region = "Two-letter state.";
  const postalCode = digits(s("postalCode")).slice(0, 5);
  if (postalCode.length !== 5) errors.postalCode = "Five-digit ZIP.";
  const repFirstName = s("repFirstName");
  const repLastName = s("repLastName");
  if (!repFirstName || !repLastName) errors.repFirstName = "First and last name of the owner or manager.";
  const repEmail = s("repEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(repEmail)) errors.repEmail = "An email the carriers can reach.";
  const repPhone = e164(s("repPhone"));
  if (!repPhone) errors.repPhone = "A US mobile.";
  const repTitle = s("repTitle") || "Owner";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    details: {
      legalName,
      businessType,
      ein: `${einDigits.slice(0, 2)}-${einDigits.slice(2)}`,
      website,
      street,
      city,
      region,
      postalCode,
      repFirstName,
      repLastName,
      repEmail,
      repPhone: repPhone!,
      repTitle,
    },
  };
}

/** Saves the details and queues the shop; a resubmission after a refusal starts over. */
export async function submitTextingRegistration(businessId: string, details: TextingDetails) {
  const fresh = {
    status: "submitted",
    detailsJson: JSON.stringify(details),
    customerProfileSid: null,
    trustProductSid: null,
    brandSid: null,
    messagingServiceSid: null,
    campaignSid: null,
    failureReason: null,
    approvedAt: null,
    lastCheckedAt: null,
    submittedAt: new Date(),
  };
  const existing = await prisma.shopTexting.findUnique({ where: { businessId } });
  if (existing && existing.status !== "failed" && existing.status !== "submitted") {
    throw new Error("Registration is already with the carriers.");
  }
  return prisma.shopTexting.upsert({ where: { businessId }, create: { businessId, ...fresh }, update: fresh });
}

/** The sender for a shop's customer and tech texts, or null to use the shared one. */
export async function shopTextSender(businessId: string): Promise<{ messagingServiceSid: string } | null> {
  const row = await prisma.shopTexting
    .findUnique({ where: { businessId }, select: { status: true, messagingServiceSid: true } })
    .catch(() => null);
  return row?.status === "approved" && row.messagingServiceSid ? { messagingServiceSid: row.messagingServiceSid } : null;
}

/* The slice of the Twilio client this uses, so tests can stand in for it. */
type Created = { sid: string };
type Evaluated = { status: string; results?: unknown };
type Bundle<A extends string, E extends string> = {
  update(p: { status: string }): Promise<unknown>;
  fetch(): Promise<{ status: string }>;
} & Record<A, { create(p: { objectSid: string }): Promise<unknown> }> &
  Record<E, { create(p: { policySid: string }): Promise<Evaluated> }>;

export type TextingTwilio = {
  trusthub: {
    v1: {
      customerProfiles: ((sid: string) => Bundle<"customerProfilesEntityAssignments", "customerProfilesEvaluations">) & {
        create(p: Record<string, unknown>): Promise<Created>;
      };
      trustProducts: ((sid: string) => Bundle<"trustProductsEntityAssignments", "trustProductsEvaluations">) & {
        create(p: Record<string, unknown>): Promise<Created>;
      };
      endUsers: { create(p: Record<string, unknown>): Promise<Created> };
      supportingDocuments: { create(p: Record<string, unknown>): Promise<Created> };
    };
  };
  addresses: { create(p: Record<string, unknown>): Promise<Created> };
  incomingPhoneNumbers: { list(p: { phoneNumber: string; limit: number }): Promise<Array<{ sid: string }>> };
  messaging: {
    v1: {
      brandRegistrations: ((sid: string) => { fetch(): Promise<{ status: string; failureReason?: string | null }> }) & {
        create(p: Record<string, unknown>): Promise<Created>;
      };
      services: ((sid: string) => {
        phoneNumbers: { create(p: { phoneNumberSid: string }): Promise<unknown> };
        usAppToPerson: ((sid: string) => {
          fetch(): Promise<{ campaignStatus: string; errors?: unknown[] }>;
        }) & { create(p: Record<string, unknown>): Promise<Created> };
      }) & { create(p: Record<string, unknown>): Promise<Created> };
    };
  };
};

type Row = NonNullable<Awaited<ReturnType<typeof prisma.shopTexting.findUnique>>>;
type Shop = { id: string; name: string; trade: string | null; twilioPhone: string | null };

const INDUSTRY: Record<string, string> = {
  HVAC: "CONSTRUCTION",
  Plumbing: "CONSTRUCTION",
  Electrical: "CONSTRUCTION",
  Roofing: "CONSTRUCTION",
  "Garage doors": "CONSTRUCTION",
  "Auto repair": "AUTOMOTIVE",
  "Dental office": "HEALTHCARE",
  "Medical office": "HEALTHCARE",
  "Law office": "LEGAL",
  "Real estate": "REAL_ESTATE",
};

function evaluationProblem(evaluation: Evaluated) {
  if (evaluation.status === "compliant") return null;
  return `details not accepted (${JSON.stringify(evaluation.results ?? []).slice(0, 300)})`;
}

async function createProfile(client: TextingTwilio, shop: Shop, d: TextingDetails) {
  const v1 = client.trusthub.v1;
  const profile = await v1.customerProfiles.create({
    friendlyName: `${shop.name} (${shop.id})`,
    email: d.repEmail,
    policySid: SECONDARY_PROFILE_POLICY,
    statusCallback: getWebhookUrl("/api/webhooks/twilio/status"),
  });
  const attach = (objectSid: string) =>
    v1.customerProfiles(profile.sid).customerProfilesEntityAssignments.create({ objectSid });

  const info = await v1.endUsers.create({
    type: "customer_profile_business_information",
    friendlyName: `${shop.name} business`,
    attributes: {
      business_name: d.legalName,
      business_identity: "direct_customer",
      business_type: d.businessType,
      business_industry: INDUSTRY[shop.trade ?? ""] ?? "PROFESSIONAL_SERVICES",
      business_registration_identifier: "EIN",
      business_registration_number: d.ein,
      business_regions_of_operation: "USA_AND_CANADA",
      website_url: d.website,
      social_media_profile_urls: "",
    },
  });
  await attach(info.sid);
  const rep = await v1.endUsers.create({
    type: "authorized_representative_1",
    friendlyName: `${shop.name} representative`,
    attributes: {
      first_name: d.repFirstName,
      last_name: d.repLastName,
      email: d.repEmail,
      phone_number: d.repPhone,
      business_title: d.repTitle,
      job_position: "Other",
    },
  });
  await attach(rep.sid);
  const address = await client.addresses.create({
    customerName: d.legalName,
    street: d.street,
    city: d.city,
    region: d.region,
    postalCode: d.postalCode,
    isoCountry: "US",
  });
  const doc = await v1.supportingDocuments.create({
    type: "customer_profile_address",
    friendlyName: `${shop.name} address`,
    attributes: { address_sids: address.sid },
  });
  await attach(doc.sid);
  await attach(process.env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID!.trim());

  const problem = evaluationProblem(
    await v1.customerProfiles(profile.sid).customerProfilesEvaluations.create({ policySid: SECONDARY_PROFILE_POLICY }),
  );
  if (problem) return { sid: profile.sid, problem };
  await v1.customerProfiles(profile.sid).update({ status: "pending-review" });
  return { sid: profile.sid, problem: null };
}

async function createTrustProduct(client: TextingTwilio, shop: Shop, d: TextingDetails, profileSid: string) {
  const v1 = client.trusthub.v1;
  const product = await v1.trustProducts.create({
    friendlyName: `${shop.name} A2P`,
    email: d.repEmail,
    policySid: A2P_PROFILE_POLICY,
  });
  const attach = (objectSid: string) => v1.trustProducts(product.sid).trustProductsEntityAssignments.create({ objectSid });
  const info = await v1.endUsers.create({
    type: "us_a2p_messaging_profile_information",
    friendlyName: `${shop.name} messaging`,
    attributes: { company_type: d.businessType === "Non-profit Corporation" ? "non-profit" : "private" },
  });
  await attach(info.sid);
  await attach(profileSid);
  const problem = evaluationProblem(
    await v1.trustProducts(product.sid).trustProductsEvaluations.create({ policySid: A2P_PROFILE_POLICY }),
  );
  if (problem) return { sid: product.sid, problem };
  await v1.trustProducts(product.sid).update({ status: "pending-review" });
  return { sid: product.sid, problem: null };
}

/** What the campaign says the shop texts; carriers approve against these exact words. */
export function campaignFor(shopName: string) {
  return {
    description: `${shopName} texts its own customers about appointments they booked by phone, text or online: confirming the time, the technician on the way, reminders, estimates and invoices, replies to questions they asked, and one review request after a completed visit. Customers who opt in separately (an unticked box on the booking page, or texting JOIN) also get occasional reminders and offers, up to 2 a month.`,
    messageFlow: `Customers give their mobile number to ${shopName} when they call, text or book online, and are told they will get texts about their appointment. Promotional texts go only to customers who tick the optional, unticked box on the booking page or text JOIN; giving a number on a call is never treated as consent to them. Every message names ${shopName}; replying STOP opts out of all texts and HELP gets help.`,
    messageSamples: [
      `${shopName}: we have you down for Tue Oct 6, 9–11am. Confirm here: https://app.orvius.im/c/abc123 Reply STOP to opt out.`,
      `${shopName}: Ray is on the way and should arrive in about 25 minutes. Reply STOP to opt out.`,
    ],
  };
}

function fail(row: Row, reason: string) {
  logWarn("shop_texting.failed", { businessId: row.businessId, reason });
  return prisma.shopTexting.update({
    where: { id: row.id },
    data: { status: "failed", failureReason: reason.slice(0, 500), lastCheckedAt: new Date() },
  });
}

/**
 * Moves one shop as far as it can go right now. Every created object's id is
 * saved before the next step, so a crash or a timeout resumes rather than
 * registering the shop twice.
 */
export async function advanceTextingRegistration(row: Row, client: TextingTwilio) {
  const shop = await prisma.business.findUnique({
    where: { id: row.businessId },
    select: { id: true, name: true, trade: true, twilioPhone: true },
  });
  if (!shop?.twilioPhone) return fail(row, "The shop has no number of its own yet.");
  const d = JSON.parse(row.detailsJson) as TextingDetails;
  const save = (data: Partial<Row>) =>
    prisma.shopTexting.update({ where: { id: row.id }, data: { ...data, lastCheckedAt: new Date() } });
  let current = row;

  if (!current.customerProfileSid) {
    const made = await createProfile(client, shop, d);
    current = await save({ customerProfileSid: made.sid, status: "profile_review" });
    if (made.problem) return fail(current, made.problem);
  }
  if (!current.trustProductSid) {
    const made = await createTrustProduct(client, shop, d, current.customerProfileSid!);
    current = await save({ trustProductSid: made.sid });
    if (made.problem) return fail(current, made.problem);
  }

  if (!current.brandSid) {
    const [profile, product] = await Promise.all([
      client.trusthub.v1.customerProfiles(current.customerProfileSid!).fetch(),
      client.trusthub.v1.trustProducts(current.trustProductSid!).fetch(),
    ]);
    if (profile.status === "twilio-rejected" || product.status === "twilio-rejected") {
      return fail(current, "Twilio rejected the business details. Check the legal name and EIN match your IRS letter.");
    }
    if (profile.status !== "twilio-approved" || product.status !== "twilio-approved") return save({});
    const brand = await client.messaging.v1.brandRegistrations.create({
      customerProfileBundleSid: current.customerProfileSid,
      a2PProfileBundleSid: current.trustProductSid,
      skipAutomaticSecVet: true,
    });
    current = await save({ brandSid: brand.sid, status: "brand_review" });
  }

  if (!current.messagingServiceSid) {
    const brand = await client.messaging.v1.brandRegistrations(current.brandSid!).fetch();
    if (brand.status === "FAILED") return fail(current, brand.failureReason || "The carriers did not register the brand.");
    if (brand.status !== "APPROVED") return save({});
    const [number] = await client.incomingPhoneNumbers.list({ phoneNumber: shop.twilioPhone, limit: 1 });
    if (!number) return fail(current, "The shop's number is not on the Orvius Twilio account.");
    const service = await client.messaging.v1.services.create({
      friendlyName: `${shop.name}`.slice(0, 64),
      useInboundWebhookOnNumber: true,
      statusCallback: getWebhookUrl("/api/webhooks/twilio/status"),
    });
    current = await save({ messagingServiceSid: service.sid });
    await client.messaging.v1.services(service.sid).phoneNumbers.create({ phoneNumberSid: number.sid });
  }

  if (!current.campaignSid) {
    const copy = campaignFor(shop.name);
    const campaign = await client.messaging.v1.services(current.messagingServiceSid!).usAppToPerson.create({
      brandRegistrationSid: current.brandSid,
      usAppToPersonUsecase: "LOW_VOLUME",
      description: copy.description,
      messageFlow: copy.messageFlow,
      messageSamples: copy.messageSamples,
      hasEmbeddedLinks: true,
      hasEmbeddedPhone: false,
    });
    current = await save({ campaignSid: campaign.sid, status: "campaign_review" });
  }

  const campaign = await client.messaging.v1
    .services(current.messagingServiceSid!)
    .usAppToPerson(current.campaignSid!)
    .fetch();
  if (campaign.campaignStatus === "FAILED") {
    return fail(current, `The carriers did not approve the campaign (${JSON.stringify(campaign.errors ?? []).slice(0, 300)}).`);
  }
  if (campaign.campaignStatus !== "VERIFIED") return save({});
  logInfo("shop_texting.approved", { businessId: current.businessId });
  return save({ status: "approved", approvedAt: new Date(), failureReason: null });
}

/** Cron: advance every shop still in review, oldest check first. */
export async function advancePendingTexting(params: { limit?: number; budgetMs?: number; client?: TextingTwilio } = {}) {
  if (!params.client && !textingRegistrationAvailable()) return { checked: 0, skipped: "not configured" };
  const client = params.client ?? (getTwilioClient() as unknown as TextingTwilio);
  const deadline = Date.now() + (params.budgetMs ?? 20_000);
  const rows = await prisma.shopTexting.findMany({
    where: { status: { in: ["submitted", "profile_review", "brand_review", "campaign_review"] } },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    take: params.limit ?? 20,
  });
  let checked = 0;
  let approved = 0;
  for (const row of rows) {
    if (Date.now() > deadline) break;
    try {
      const next = await advanceTextingRegistration(row, client);
      checked += 1;
      if (next.status === "approved") approved += 1;
    } catch (error) {
      checked += 1;
      logWarn("shop_texting.step_error", {
        businessId: row.businessId,
        error: error instanceof Error ? error.message : "unknown",
      });
      await prisma.shopTexting.update({ where: { id: row.id }, data: { lastCheckedAt: new Date() } });
    }
  }
  return { checked, approved };
}
