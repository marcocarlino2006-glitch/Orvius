import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { isConfigured } from "@/lib/env";

export type ShopHealthStatus = "healthy" | "attention" | "critical";

export type ShopHealth = {
  status: ShopHealthStatus;
  checks: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
  line: string | null;
  lineVerified: boolean;
  lineVerifiedAt: string | null;
  lastCallAt: string | null;
  lastLeadAt: string | null;
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

  const line =
    business.vapiPhoneNumber ??
    business.twilioPhone ??
    process.env.TWILIO_PHONE_NUMBER?.trim() ??
    null;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastCall, lastLead, failedAlerts, recentFailures] = await Promise.all([
    prisma.call.findFirst({
      where: { businessId },
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
  ]);

  const smsEnabled = process.env.ENABLE_OWNER_SMS === "true";
  const ownerPhoneOk = Boolean(business.ownerPhone?.trim());
  const ownerEmailOk = Boolean(business.ownerEmail?.trim());
  const lineOk = Boolean(line);
  const assistantOk = Boolean(business.vapiAssistantId);
  const lineVerified = Boolean(business.lineVerifiedAt);
  const emailReady = isEmailConfigured();

  const checks = [
    {
      id: "line",
      label: "Shop line",
      ok: lineOk,
      detail: lineOk ? (line as string) : "No inbound number assigned",
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
        ? `Verified ${business.lineVerifiedAt!.toLocaleString()}`
        : "Place a test call to confirm end-to-end",
    },
    {
      id: "owner-phone",
      label: "Owner mobile",
      ok: ownerPhoneOk,
      detail: ownerPhoneOk ? business.ownerPhone! : "Add your mobile in Settings",
    },
    {
      id: "sms",
      label: "SMS alerts",
      ok: !smsEnabled || ownerPhoneOk,
      detail: smsEnabled
        ? ownerPhoneOk
          ? "Enabled"
          : "SMS on — owner phone missing"
        : "SMS not enabled on platform",
    },
    {
      id: "email",
      label: "Email backup",
      ok: !ownerEmailOk || emailReady,
      detail: emailReady
        ? ownerEmailOk
          ? "Ready"
          : "Resend configured — add owner email"
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
    (smsEnabled && !ownerPhoneOk) ||
    !isConfigured("VAPI_API_KEY");

  let status: ShopHealthStatus = "healthy";
  if (criticalFailed) status = "critical";
  else if (attentionFailed) status = "attention";

  return {
    status,
    checks,
    line,
    lineVerified,
    lineVerifiedAt: business.lineVerifiedAt?.toISOString() ?? null,
    lastCallAt: lastCall?.createdAt.toISOString() ?? null,
    lastLeadAt: lastLead?.createdAt.toISOString() ?? null,
    failedAlerts24h: failedAlerts,
    recentFailures: recentFailures.map((item) => ({
      channel: item.channel,
      error: item.error,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
