import { buildAssistantSystemPrompt } from "@/lib/business";
import {
  isDemoPlatformLine,
  shopMustNotUseDemoLine,
} from "@/lib/demo-business";
import { getWebhookUrl } from "@/lib/env";
import { attachAssistantToShopLine } from "@/lib/vapi-line";
import { updateAssistant } from "@/lib/vapi";
import type { Business } from "@prisma/client";

export type AssistantSyncResult = {
  assistantUpdated: boolean;
  lineAttached: boolean;
  line: string | null;
  warning: string | null;
};

export async function syncBusinessAssistant(
  business: Business,
): Promise<AssistantSyncResult> {
  if (!business.vapiAssistantId) {
    return {
      assistantUpdated: false,
      lineAttached: false,
      line: null,
      warning: "No AI receptionist linked to this shop",
    };
  }

  const greeting =
    business.greeting?.trim() ||
    `Thank you for calling ${business.name}. How can I help you today?`;

  const systemPrompt = buildAssistantSystemPrompt({
    name: business.name,
    greeting,
    hoursJson: business.hoursJson,
    servicesJson: business.servicesJson,
  });

  await updateAssistant(business.vapiAssistantId, {
    name: `${business.name} Receptionist`,
    firstMessage: greeting,
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [{ role: "system", content: systemPrompt }],
    },
    serverUrl: getWebhookUrl("/api/webhooks/vapi"),
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
  });

  const line = business.vapiPhoneNumber ?? business.twilioPhone ?? null;
  let lineAttached = false;
  let warning: string | null = null;

  if (!line) {
    warning = "No shop line assigned — call hello@orvius.im to finish setup";
  } else if (shopMustNotUseDemoLine(business) && isDemoPlatformLine(line)) {
    warning =
      "Your shop is on the marketing demo line — use Re-sync in Settings to get your dedicated number";
  } else {
    await attachAssistantToShopLine({
      phone: line,
      assistantId: business.vapiAssistantId,
      shopName: business.name,
    });
    lineAttached = true;
  }

  return {
    assistantUpdated: true,
    lineAttached,
    line,
    warning,
  };
}
