import {
  assertCustomerShopLine,
  getShopLineForBusiness,
  isDemoPlatformLine,
  shopHasWrongDemoLine,
  shopMustNotUseDemoLine,
} from "@/lib/demo-business";
import {
  buildAssistantSystemPrompt,
  slugify,
  type ServiceOffering,
} from "@/lib/business";
import { getWebhookUrl, isConfigured } from "@/lib/env";
import { logError } from "@/lib/logger";
import {
  getShopLines,
  validateOwnerPhoneForAlerts,
} from "@/lib/owner-alerts";
import { prisma } from "@/lib/prisma";
import { syncBusinessAssistant } from "@/lib/sync-business-assistant";
import {
  canProvisionDedicatedLine,
  configureSmsWebhook,
  purchaseLocalNumber,
  releasePhoneNumber,
} from "@/lib/twilio-phone";
import { type Trade } from "@/lib/trades";
import { attachAssistantToShopLine } from "@/lib/vapi-line";
import {
  buildVapiAssistantConfig,
  createAssistant,
  deleteAssistant,
} from "@/lib/vapi";
import type { Business } from "@prisma/client";

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
  business: Business;
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
  await attachAssistantToShopLine({
    phone,
    assistantId: params.assistantId,
    shopName: params.shopName,
  });
  return phone;
}

async function rollbackProvision(params: {
  vapiAssistantId: string | null;
  shopLine: string | null;
  releaseLine: boolean;
}) {
  if (params.shopLine && params.releaseLine) {
    try {
      await releasePhoneNumber(params.shopLine);
    } catch (error) {
      logError("provision.rollback.phone_failed", {
        shopLine: params.shopLine,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  if (params.vapiAssistantId) {
    try {
      await deleteAssistant(params.vapiAssistantId);
    } catch (error) {
      logError("provision.rollback.assistant_failed", {
        vapiAssistantId: params.vapiAssistantId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}

export function shopNeedsAutoLine(business: {
  slug: string;
  name?: string;
  twilioPhone?: string | null;
  vapiPhoneNumber?: string | null;
  vapiAssistantId?: string | null;
  ownerPhone?: string | null;
}): boolean {
  if (!shopMustNotUseDemoLine(business)) return false;
  if (!business.vapiAssistantId?.trim() || !business.ownerPhone?.trim()) {
    return false;
  }
  const line = getShopLineForBusiness(business);
  return !line || shopHasWrongDemoLine(business);
}

/**
 * Silently provision a dedicated line when a customer shop needs one.
 * No manual re-sync — runs automatically on dashboard load.
 */
export async function autoEnsureCustomerShopLine(
  business: Business,
): Promise<{ business: Business; provisioned: boolean }> {
  if (!shopNeedsAutoLine(business)) {
    return { business, provisioned: false };
  }

  try {
    const result = await ensureDedicatedShopLine(business);
    return { business: result.business, provisioned: true };
  } catch (error) {
    logError("autoEnsureCustomerShopLine.failed", {
      businessId: business.id,
      name: business.name,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { business, provisioned: false };
  }
}

export async function getBusinessForOwnerWithAutoLine(email: string) {
  const business = await prisma.business.findFirst({
    where: { ownerEmail: email.toLowerCase(), isActive: true },
    orderBy: { createdAt: "asc" },
  });

  if (!business) return null;

  const { business: ready } = await autoEnsureCustomerShopLine(business);
  return ready;
}

/**
 * Every signed-up shop gets a dedicated line wired to THEIR assistant.
 * The marketing demo line (+1 844…) stays Summit-only — never shared.
 */
export async function ensureDedicatedShopLine(business: Business): Promise<{
  business: Business;
  repaired: boolean;
  dedicatedLine: boolean;
}> {
  if (!business.vapiAssistantId) {
    throw new Error("AI receptionist is not provisioned for this shop");
  }

  const currentLine = business.vapiPhoneNumber ?? business.twilioPhone;
  const needsLine =
    !currentLine ||
    (shopMustNotUseDemoLine(business) && isDemoPlatformLine(currentLine));

  if (!needsLine && currentLine) {
    await attachAssistantToShopLine({
      phone: currentLine,
      assistantId: business.vapiAssistantId,
      shopName: business.name,
    });
    await syncBusinessAssistant(business);
    return { business, repaired: false, dedicatedLine: true };
  }

  if (!canProvisionDedicatedLine()) {
    throw new Error(
      "Dedicated line provisioning is not available. Contact hello@orvius.im",
    );
  }

  const ownerPhone = business.ownerPhone;
  if (!ownerPhone?.trim()) {
    throw new Error("Add your owner mobile in Settings before provisioning a shop line");
  }

  const shopLine = await provisionDedicatedLine({
    shopName: business.name,
    ownerPhone,
    assistantId: business.vapiAssistantId,
  });

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      twilioPhone: shopLine,
      vapiPhoneNumber: shopLine,
    },
  });

  await syncBusinessAssistant(updated);

  return {
    business: updated,
    repaired: shopHasWrongDemoLine(business) || !currentLine,
    dedicatedLine: true,
  };
}

/** Repair every customer shop — each must have its own dedicated line. */
export async function repairAllCustomerShopLines(): Promise<
  Array<{ businessId: string; name: string; line: string | null; error?: string }>
> {
  const businesses = await prisma.business.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });

  const results: Array<{
    businessId: string;
    name: string;
    line: string | null;
    error?: string;
  }> = [];

  for (const business of businesses) {
    if (!shopMustNotUseDemoLine(business)) {
      results.push({
        businessId: business.id,
        name: business.name,
        line: getShopLineForBusiness(business),
      });
      continue;
    }

    try {
      const { business: updated } = await ensureDedicatedShopLine(business);
      results.push({
        businessId: updated.id,
        name: updated.name,
        line: getShopLineForBusiness(updated),
      });
    } catch (error) {
      results.push({
        businessId: business.id,
        name: business.name,
        line: getShopLineForBusiness(business),
        error: error instanceof Error ? error.message : "Repair failed",
      });
    }
  }

  return results;
}

export async function provisionBusiness(input: ProvisionInput): Promise<ProvisionResult> {
  const email = input.ownerEmail.toLowerCase().trim();
  const existing = await findBusinessForOwner(email);
  if (existing) {
    throw new Error("A shop is already linked to this account");
  }

  const name = input.name.trim();
  const slug = await uniqueSlug(name);

  const phoneCheck = validateOwnerPhoneForAlerts({
    ownerPhone: input.ownerPhone,
    shopLines: [],
  });
  if (!phoneCheck.ok) {
    throw new Error(phoneCheck.reason);
  }

  if (!isConfigured("VAPI_API_KEY")) {
    throw new Error("Voice AI is not configured. Contact hello@orvius.im");
  }

  if (!canProvisionDedicatedLine()) {
    throw new Error(
      "We could not provision a dedicated shop line right now. Contact hello@orvius.im",
    );
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
  let shopLine: string | null = null;

  try {
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

    try {
      shopLine = await provisionDedicatedLine({
        shopName: name,
        ownerPhone: input.ownerPhone,
        assistantId: vapiAssistantId,
      });
    } catch (error) {
      logError("provision.dedicated_line_failed", {
        shopName: name,
        error: error instanceof Error ? error.message : "unknown",
      });
      throw new Error(
        "Could not assign your dedicated shop line. Try again in a moment or contact hello@orvius.im",
      );
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
        pilotEndsAt: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 30);
          return d;
        })(),
      },
    });

    await syncBusinessAssistant(business);

    return { business, dedicatedLine: true };
  } catch (error) {
    await rollbackProvision({
      vapiAssistantId,
      shopLine,
      releaseLine: Boolean(shopLine),
    });
    throw error;
  }
}
