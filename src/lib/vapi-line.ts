import { importTwilioPhoneToVapi } from "@/lib/vapi";

export async function attachAssistantToShopLine(params: {
  phone: string;
  assistantId: string;
  shopName: string;
}) {
  return importTwilioPhoneToVapi({
    number: params.phone,
    assistantId: params.assistantId,
    name: `${params.shopName} line`,
  });
}
