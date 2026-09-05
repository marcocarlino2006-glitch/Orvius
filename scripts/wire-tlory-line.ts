/**
 * Wire Tlory's already-purchased Twilio line to its Vapi assistant.
 * Fixes the http→https webhook rejection from the first provision attempt.
 */
import { loadEnvFile } from "./lib/db.mjs";

loadEnvFile();

async function main() {
  const { getWebhookUrl } = await import("../src/lib/env");
  const { attachAssistantToShopLine } = await import("../src/lib/vapi-line");
  const { syncBusinessAssistant } = await import(
    "../src/lib/sync-business-assistant"
  );
  const { prisma } = await import("../src/lib/prisma");

  console.log("Webhook URL:", getWebhookUrl("/api/webhooks/vapi"));

  const tlory = await prisma.business.findUnique({ where: { slug: "tlory" } });
  if (!tlory) throw new Error("Tlory not found");
  if (!tlory.vapiAssistantId) throw new Error("Tlory missing assistant");
  const phone = tlory.vapiPhoneNumber ?? tlory.twilioPhone;
  if (!phone) throw new Error("Tlory missing phone");

  console.log(`Attaching ${phone} → ${tlory.vapiAssistantId}`);
  await attachAssistantToShopLine({
    phone,
    assistantId: tlory.vapiAssistantId,
    shopName: tlory.name,
  });
  await syncBusinessAssistant(tlory);
  if (!tlory.lineVerifiedAt) {
    await prisma.business.update({
      where: { id: tlory.id },
      data: { lineVerifiedAt: new Date() },
    });
  }
  console.log("✅ Tlory line wired to Vapi");
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
