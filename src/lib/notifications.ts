import { getTwilioClient } from "@/lib/twilio-client";

import type { ChannelDeliveryStatus, ChannelResult, NotifyOwnerResult } from "@/lib/notification-queue";

export type { ChannelDeliveryStatus, ChannelResult, NotifyOwnerResult };

export function buildLeadAlertDedupeKey(source: {
  vapiCallId?: string | null;
  messageSid?: string | null;
  leadId?: string;
}) {
  if (source.vapiCallId) {
    return `call:${source.vapiCallId}`;
  }
  if (source.messageSid) {
    return `sms:${source.messageSid}`;
  }
  if (source.leadId) {
    return `lead:${source.leadId}`;
  }
  return `alert:${Date.now()}`;
}

export {
  enqueueOwnerAlert,
  notifyOwnerSync as notifyOwner,
  processNotificationQueue,
} from "@/lib/notification-queue";
