import { buildAssistantSystemPrompt } from "@/lib/business";
import {
  getDemoPlatformLine,
  isDemoPlatformLine,
  shopMustNotUseDemoLine,
} from "@/lib/demo-business";
import { getWebhookUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import type { Trade } from "@/lib/trades";
import { attachAssistantToShopLine } from "@/lib/vapi-line";
import {
  buildVapiAssistantConfig,
  updateAssistant,
  vapiRequest,
} from "@/lib/vapi";
import type { Business } from "@prisma/client";

export type AssistantSyncResult = {
  assistantUpdated: boolean;
  lineAttached: boolean;
  line: string | null;
  warning: string | null;
};

export function buildBusinessAssistantConfig(business: Business) {
  const greeting =
    business.greeting?.trim() ||
    `Thank you for calling ${business.name}. How can I help you today?`;
  const transferPhone = business.transferPhone?.trim() || null;

  const systemPrompt = buildAssistantSystemPrompt({
    name: business.name,
    greeting,
    hoursJson: business.hoursJson,
    servicesJson: business.servicesJson,
    trade: (business.trade as Trade | null) ?? null,
    canTransfer: Boolean(transferPhone),
  });
  return buildVapiAssistantConfig({
    businessName: business.name,
    greeting,
    systemPrompt,
    webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
    webhookSecret: process.env.VAPI_WEBHOOK_SECRET,
    transferPhone,
  });
}

export async function syncBusinessAssistant(
  business: Business,
): Promise<AssistantSyncResult> {
  if (!business.vapiAssistantId) {
    return {
      assistantUpdated: false,
      lineAttached: false,
      line: null,
      warning: "No night line linked to this shop",
    };
  }

  await updateAssistant(business.vapiAssistantId, buildBusinessAssistantConfig(business));

  const line = business.vapiPhoneNumber ?? business.twilioPhone ?? null;
  let lineAttached = false;
  let warning: string | null = null;

  if (!line) {
    warning = "No shop line assigned — call hello@orvius.im to finish setup";
  } else if (shopMustNotUseDemoLine(business) && isDemoPlatformLine(line)) {
    warning =
      "Your dedicated line is being assigned — refresh in a moment.";
  } else {
    await attachAssistantToShopLine({
      phone: line,
      assistantId: business.vapiAssistantId,
      shopName: business.name,
    });
    lineAttached = true;
  }

  /*
    The marketing site's "call the live line" number belongs to the demo shop.
    It was left on an old assistant whose webhook was a dead tunnel, so every
    prospect's demo call produced no lead. The demo shop's sync owns it now.
  */
  if (!shopMustNotUseDemoLine(business) && business.environment !== "test" && !isDemoPlatformLine(line)) {
    await claimDemoLineIfOrphaned(business.vapiAssistantId, business.name);
  }

  return {
    assistantUpdated: true,
    lineAttached,
    line,
    warning,
  };
}

/**
 * Several workspaces count as demo shops, so the line is only taken over when
 * the assistant on it cannot deliver calls to this deployment — never from a
 * healthy demo shop.
 */
async function claimDemoLineIfOrphaned(assistantId: string, shopName: string) {
  const demoLine = getDemoPlatformLine();
  if (!demoLine) return;
  const numbers = await vapiRequest<Array<{ number?: string; assistantId?: string | null }>>("/phone-number?limit=100");
  const entry = numbers.find((n) => isDemoPlatformLine(n.number));
  if (!entry || entry.assistantId === assistantId) return;
  if (entry.assistantId) {
    const current = await vapiRequest<{ serverUrl?: string; server?: { url?: string } }>(
      `/assistant/${entry.assistantId}`,
    ).catch(() => null);
    const url = current?.server?.url ?? current?.serverUrl ?? null;
    if (url === getWebhookUrl("/api/webhooks/vapi")) return;
  }
  await attachAssistantToShopLine({ phone: demoLine, assistantId, shopName: `${shopName} demo` });
  logInfo("vapi.demo_line.claimed", { assistantId, previous: entry.assistantId ?? null });
}

const confirmed = new Map<string, string>();

/**
 * Bring the shop's live assistant up to the deployed prompt and voice config.
 *
 * Assistants were only rewritten when an owner saved Settings, so a prompt
 * fix shipped to production never reached a shop that did not touch Settings
 * afterwards. Each assistant carries a fingerprint of the config it was built
 * from; a mismatch means it predates this deploy (or was edited by hand in
 * Vapi) and is rewritten. Matching fingerprints cost one GET, once per process.
 */
export async function ensureAssistantCurrent(
  business: Business,
): Promise<"current" | "updated" | "skipped"> {
  const assistantId = business.vapiAssistantId;
  if (!assistantId || !process.env.VAPI_API_KEY) return "skipped";

  const expected = buildBusinessAssistantConfig(business).metadata?.orviusConfig;
  if (!expected || confirmed.get(assistantId) === expected) return "current";

  try {
    const live = await vapiRequest<{ metadata?: { orviusConfig?: string } }>(`/assistant/${assistantId}`);
    if (live.metadata?.orviusConfig !== expected) {
      await syncBusinessAssistant(business);
      logInfo("vapi.assistant.resynced", {
        businessId: business.id,
        assistantId,
        from: live.metadata?.orviusConfig ?? null,
        to: expected,
      });
      confirmed.set(assistantId, expected);
      return "updated";
    }
    confirmed.set(assistantId, expected);
    return "current";
  } catch (error) {
    logWarn("vapi.assistant.resync_failed", {
      businessId: business.id,
      assistantId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return "skipped";
  }
}
