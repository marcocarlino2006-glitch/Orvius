import { createHmac, timingSafeEqual } from "node:crypto";

import { recordAudit } from "@/lib/audit";
import { getAppUrl } from "@/lib/env";
import { prisma } from "@/lib/prisma";

/*
  The Monday email's unsubscribe link is signed, not stored, so it works from
  any inbox with no session, and mail providers can stop it in one click
  (RFC 8058) without the owner signing in.
*/

function secret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

function sign(businessId: string, key: string) {
  return createHmac("sha256", key).update(`weekly-email:${businessId}`).digest("base64url").slice(0, 32);
}

export function weeklyEmailToken(businessId: string): string | null {
  const key = secret();
  return key ? `${businessId}.${sign(businessId, key)}` : null;
}

export function verifyWeeklyEmailToken(token: string | null | undefined): string | null {
  const key = secret();
  if (!key || !token || token.length > 200) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const businessId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(sign(businessId, key));
  return given.length === want.length && timingSafeEqual(given, want) ? businessId : null;
}

/** The page a person lands on from the email footer, and the URL mail providers POST to. */
export function weeklyEmailUnsubscribe(businessId: string) {
  const token = weeklyEmailToken(businessId);
  if (!token) return null;
  const base = getAppUrl().replace(/\/$/, "");
  const t = encodeURIComponent(token);
  return { page: `${base}/unsubscribe?t=${t}`, oneClick: `${base}/api/public/unsubscribe?t=${t}` };
}

export async function setWeeklyEmail(businessId: string, on: boolean, now = new Date()) {
  const updated = await prisma.business.updateMany({
    where: { id: businessId },
    data: { weeklyEmailOffAt: on ? null : now },
  });
  if (!updated.count) return false;
  await recordAudit({
    businessId,
    entityType: "shop",
    entityId: businessId,
    action: on ? "shop.weekly_email_on" : "shop.weekly_email_off",
    actor: "owner",
    summary: on ? "Monday results email turned back on" : "Monday results email stopped from the email's unsubscribe link",
  });
  return true;
}
