import {
  buildAssistantSystemPrompt,
  slugify,
  type ServiceOffering,
} from "@/lib/business";
import { getWebhookUrl, isConfigured } from "@/lib/env";
import {
  getShopLines,
  validateOwnerPhoneForAlerts,
} from "@/lib/owner-alerts";
import { prisma } from "@/lib/prisma";
import {
  canProvisionDedicatedLine,
  configureSmsWebhook,
  purchaseLocalNumber,
} from "@/lib/twilio-phone";
import { type Trade } from "@/lib/trades";
import {
  buildVapiAssistantConfig,
  createAssistant,
  importTwilioPhoneToVapi,
} from "@/lib/vapi";

export type { Trade } from "@/lib/trades";
export { TRADES } from "@/lib/trades";

export const DEFAULT_HOURS_JSON = JSON.stringify({
  monday: { open: "08:00", close: "18:00" },
  tuesday: { open: "08:00", close: "18:00" },
  wednesday: { open: "08:00", close: "18:00" },
  thursday: { open: "08:00", close: "18:00" },
  friday: { open: "08:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true, open: "00:00", close: "00:00" },
});

const TRADE_SERVICES: Record<Trade, ServiceOffering[]> = {
  HVAC: [
    { name: "AC repair", description: "Cooling system diagnosis and repair" },
    { name: "Heating repair", description: "Furnace and heat pump service" },
    { name: "Maintenance", description: "Seasonal tune-ups and inspections" },
    { name: "Installation", description: "New system quotes and install" },
  ],
  Plumbing: [
    { name: "Leak repair", description: "Active leaks and pipe failures" },
    { name: "Drain cleaning", description: "Clogs and slow drains" },
    { name: "Water heater", description: "Repair and replacement" },
    { name: "Emergency plumbing", description: "Same-day urgent service" },
  ],
  Electrical: [
    { name: "Outlet & switch repair", description: "Residential electrical fixes" },
    { name: "Panel work", description: "Breaker panels and upgrades" },
    { name: "Emergency electrical", description: "No power and safety issues" },
    { name: "Lighting", description: "Fixtures and dimmer installs" },
  ],
};

export function servicesForTrade(trade: Trade): string {
  return JSON.stringify(TRADE_SERVICES[trade]);
}

export async function findBusinessForOwner(email: string) {
  return prisma.business.findFirst({
    where: { ownerEmail: email.toLowerCase() },
    orderBy: { createdAt: "asc" },
  });
}

export async function isOnboardingComplete(email: string): Promise<boolean> {
  const business = await findBusinessForOwner(email);
  return Boolean(business);
}

export type ProvisionInput = {
  name: string;
  trade: Trade;
  ownerEmail: string;
  ownerPhone: string;
  greeting?: string;
  timezone?: string;
};

export type ProvisionResult = {
  business: Awaited<ReturnType<typeof prisma.business.create>>;
  dedicatedLine: boolean;
};

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "shop";
  let candidate = base;
  let attempt = 0;

  while (await prisma.business.findUnique({ where: { slug: candidate } })) {
    attempt += 1;
    candidate = `${base}-${attempt + 1}`;
  }

  return candidate;
}

async function provisionDedicatedLine(params: {
  shopName: string;
  ownerPhone: string;
  assistantId: string;
}) {
  const phone = await purchaseLocalNumber(params.ownerPhone);
  await configureSmsWebhook(phone);
  await importTwilioPhoneToVapi({
    number: phone,
    assistantId: params.assistantId,
    name: `${params.shopName} line`,
  });
  return phone;
}

export async function provisionBusiness(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.ownerEmail.toLowerCase().trim();
  const existing = await findBusinessForOwner(email);
  if (existing) {
    throw new Error("A shop is already linked to this account");
  }

  const name = input.name.trim();
  const slug = await uniqueSlug(name);
  const platformLine = process.env.TWILIO_PHONE_NUMBER?.trim() || null;

  const phoneCheck = validateOwnerPhoneForAlerts({
    ownerPhone: input.ownerPhone,
    shopLines: [platformLine],
  });
  if (!phoneCheck.ok) {
    throw new Error(phoneCheck.reason);
  }

  const greeting =
    input.greeting?.trim() ||
    `Thank you for calling ${name}. How can I help you today?`;
  const hoursJson = DEFAULT_HOURS_JSON;
  const servicesJson = servicesForTrade(input.trade);

  const systemPrompt = buildAssistantSystemPrompt({
    name,
    greeting,
    hoursJson,
    servicesJson,
  });

  let vapiAssistantId: string | null = null;
  if (isConfigured("VAPI_API_KEY")) {
    const assistant = await createAssistant(
      buildVapiAssistantConfig({
        businessName: name,
        systemPrompt,
        greeting,
        webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
        webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
      }),
    );
    vapiAssistantId = assistant.id;
  }

  let shopLine: string | null = platformLine;
  let dedicatedLine = false;

  if (vapiAssistantId && canProvisionDedicatedLine()) {
    try {
      shopLine = await provisionDedicatedLine({
        shopName: name,
        ownerPhone: input.ownerPhone,
        assistantId: vapiAssistantId,
      });
      dedicatedLine = true;
    } catch (error) {
      console.error("Dedicated line provisioning failed, using platform line:", error);
    }
  }

  const postProvisionCheck = validateOwnerPhoneForAlerts({
    ownerPhone: input.ownerPhone,
    shopLines: getShopLines({
      twilioPhone: shopLine,
      vapiPhoneNumber: shopLine,
    }),
  });
  if (!postProvisionCheck.ok) {
    throw new Error(postProvisionCheck.reason);
  }

  const business = await prisma.business.create({
    data: {
      name,
      slug,
      ownerEmail: email,
      ownerPhone: input.ownerPhone.trim(),
      timezone: input.timezone ?? "America/New_York",
      greeting,
      hoursJson,
      servicesJson,
      twilioPhone: shopLine,
      vapiPhoneNumber: shopLine,
      vapiAssistantId,
      billingStatus: "pilot",
    },
  });

  return { business, dedicatedLine };
}
