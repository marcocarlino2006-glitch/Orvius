import {
  buildForwardGuideSms,
  type CaptureMode,
  type CarrierId,
} from "@/lib/carrier-forward";
import { sendSms } from "@/lib/twilio-sms";
import type { Business } from "@prisma/client";

export {
  getOwnerSetupStatus,
  getShopLine,
  ownerSetupHref,
  type OwnerSetupStatus,
} from "@/lib/owner-setup-state";

export async function sendOwnerForwardGuide(params: {
  business: Pick<Business, "id" | "name" | "ownerPhone">;
  orviusLine: string;
  mode: CaptureMode;
  carrier?: CarrierId;
}): Promise<{ sent: boolean; reason?: string }> {
  const to = params.business.ownerPhone?.trim();
  if (!to) return { sent: false, reason: "no_owner_phone" };

  const body = buildForwardGuideSms({
    shopName: params.business.name,
    orviusLine: params.orviusLine,
    mode: params.mode,
    carrier: params.carrier,
  });

  const result = await sendSms({ to, body });
  if (!result) return { sent: false, reason: "sms_unavailable" };
  return { sent: true };
}
