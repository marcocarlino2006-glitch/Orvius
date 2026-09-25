import webpush from "web-push";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/**
 * Push alerts to the owner's phone or desktop. Rides alongside SMS and email,
 * never instead of them: a push can be silenced by the OS, a text can't.
 */

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configured() {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT?.trim() || "mailto:hello@orvius.im", publicKey, privateKey);
  return true;
}

export type OwnerPush = { title: string; body: string; url?: string; tag?: string; urgent?: boolean };

/** First line of an owner alert, trimmed for a lock screen. */
export function pushFromAlert(businessName: string, message: string, leadId?: string): OwnerPush {
  const lines = message.split("\n").map((line) => line.trim()).filter(Boolean);
  const urgent = /^SAFETY|emergency/i.test(message);
  return {
    title: urgent ? `Urgent · ${businessName}` : businessName,
    body: (lines.slice(0, 2).join(" · ") || "New call").slice(0, 180),
    url: leadId ? `/dashboard/inbox/${leadId}` : "/dashboard",
    tag: leadId ? `lead-${leadId}` : undefined,
    urgent,
  };
}

export async function sendOwnerPush(businessId: string, push: OwnerPush): Promise<number> {
  if (!configured()) return 0;
  const subscriptions = await prisma.pushSubscription.findMany({ where: { businessId } });
  let delivered = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(push),
          { TTL: 60 * 60, urgency: push.urgent ? "high" : "normal", timeout: 5000 },
        );
        delivered++;
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastSentAt: new Date() } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription; it will never work again.
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
        } else {
          logWarn("push.send_failed", { businessId, status: status ?? null });
        }
      }
    }),
  );
  if (delivered) logInfo("push.sent", { businessId, delivered });
  return delivered;
}
