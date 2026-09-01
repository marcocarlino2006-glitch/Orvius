import { buildAssistantSystemPrompt } from "@/lib/business";
import { getWebhookUrl } from "@/lib/env";
import { updateAssistant } from "@/lib/vapi";
import type { Business } from "@prisma/client";

export async function syncBusinessAssistant(business: Business) {
  if (!business.vapiAssistantId) return;

  const greeting =
    business.greeting ??
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
}
