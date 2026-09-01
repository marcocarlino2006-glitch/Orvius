import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { isConfigured } from "@/lib/env";
import {
  getShopLines,
  ownerPhoneConflictsWithShopLine,
} from "@/lib/owner-alerts";

export type ShopHealthStatus = "healthy" | "attention" | "critical";

export type ShopHealthCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type ShopHealth = {
  status: ShopHealthStatus;
  checks: ShopHealthCheck[];
  line: string | null;
  dedicatedLine: boolean;
  lineVerified: boolean;
  lineVerifiedAt: string | null;
  lastCallAt: string | null;
  lastLeadAt: string | null;
  lastAlertAt: string | null;
  failedAlerts24h: number;
  recentFailures: Array<{
    channel: string;
    error: string | null;
    createdAt: string;
  }>;
};

export async function getShopHealth(businessId: string): Promise<ShopHealth> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      name: true,
      ownerPhone: true,
      ownerEmail: true,
      vapiAssistantId: true,
      vapiPhoneNumber: true,
      twilioPhone: true,
      lineVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!business) {
    throw new Error("Business not found");
  }

  const shopLines = getShopLines(business);
  const dedicatedLine = shopLines.length > 0;
  const line = shopLines[0] ?? null;
  const platformLine = process.env.TWILIO_PHONE_NUMBER?.trim() ?? null;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastCall, lastLead, failedAlerts, recentFailures, lastSuccess] =
    await Promise.all([
      prisma.call.findFirst({
        where: { businessId, status: "completed" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.lead.findFirst({
        where: { businessId },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.ownerNotification.count({
        where: { businessId, status: "failed", createdAt: { gte: since24h } },
      }),
      prisma.ownerNotification.findMany({
        where: { businessId, status: "failed", createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { channel: true, error: true, createdAt: true },
      }),
      prisma.ownerNotification.findFirst({
        where: { businessId, status: "sent" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, channel: true },
      }),
    ]);

  const smsEnabled = process.env.ENABLE_OWNER_SMS === "true";
  const ownerPhoneOk = Boolean(business.ownerPhone?.trim());
  const ownerEmailOk = Boolean(business.ownerEmail?.trim());
  const ownerPhoneConflict = ownerPhoneConflictsWithShopLine({
    ownerPhone: business.ownerPhone,
    shopLines,
  });
  const lineOk = dedicatedLine;
  const assistantOk = Boolean(business.vapiAssistantId);
  const lineVerified = Boolean(business.lineVerifiedAt);
  const emailReady = isEmailConfigured();

  const checks: ShopHealthCheck[] = [
    {
      id: "line",
      label: "Dedicated shop line",
      ok: lineOk,
      detail: lineOk
        ? line!
        : platformLine
          ? `Using shared platform line (${platformLine}) — dedicated line recommended`
          : "No inbound number assigned",
    },
    {
      id: "assistant",
      label: "AI receptionist",
      ok: assistantOk,
      detail: assistantOk ? "Connected" : "Assistant not provisioned",
    },
    {
      id: "verified",
      label: "Line tested",
      ok: lineVerified,
      detail: lineVerified
        ? `Verified ${business.lineVerifiedAt!.toISOString()}`
        : "Place a completed test call to confirm end-to-end",
    },
    {
      id: "owner-phone",
      label: "Owner mobile",
      ok: ownerPhoneOk && !ownerPhoneConflict,
      detail: ownerPhoneConflict
        ? "Owner mobile matches shop line — SMS will not reach your cell"
        : ownerPhoneOk
          ? business.ownerPhone!
          : "Add your mobile in Settings",
    },
    {
      id: "sms",
      label: "SMS alerts",
      ok: !smsEnabled || (ownerPhoneOk && !ownerPhoneConflict),
      detail: !smsEnabled
        ? "SMS not enabled on platform"
        : ownerPhoneConflict
          ? "Fix owner mobile — cannot match shop line"
          : ownerPhoneOk
            ? "Enabled"
            : "SMS on — owner phone missing",
    },
    {
      id: "email",
      label: "Email backup",
      ok: !ownerEmailOk || emailReady,
      detail: emailReady
        ? ownerEmailOk
          ? "Ready"
          : "Resend configured — add owner email in Settings"
        : ownerEmailOk
          ? "Add RESEND_API_KEY for email backup"
          : "Optional",
    },
    {
      id: "vapi",
      label: "Voice platform",
      ok: isConfigured("VAPI_API_KEY"),
      detail: isConfigured("VAPI_API_KEY") ? "Connected" : "VAPI_API_KEY missing",
    },
  ];

  const criticalFailed = !lineOk || !assistantOk;
  const attentionFailed =
    !lineVerified ||
    failedAlerts > 0 ||
    ownerPhoneConflict ||
    (smsEnabled && !ownerPhoneOk) ||
    !isConfigured("VAPI_API_KEY");

  let status: ShopHealthStatus = "healthy";
  if (criticalFailed) status = "critical";
  else if (attentionFailed) status = "attention";

  return {
    status,
    checks,
    line,
    dedicatedLine,
    lineVerified,
    lineVerifiedAt: business.lineVerifiedAt?.toISOString() ?? null,
    lastCallAt: lastCall?.createdAt.toISOString() ?? null,
    lastLeadAt: lastLead?.createdAt.toISOString() ?? null,
    lastAlertAt: lastSuccess?.createdAt.toISOString() ?? null,
    failedAlerts24h: failedAlerts,
    recentFailures: recentFailures.map((item) => ({
      channel: item.channel,
      error: item.error,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
