import { shopHasWrongDemoLine } from "@/lib/demo-business";
import { prisma } from "@/lib/prisma";
import { isEmailConfigured } from "@/lib/email";
import { getAlertMetrics } from "@/lib/alert-metrics";
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
  pendingAlerts: number;
  stuckPendingAlerts: number;
  alertLatencyP50Sec: number | null;
  alertLatencyP95Sec: number | null;
  alertSpeedOk: boolean;
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
      slug: true,
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
  const line = shopLines[0] ?? null;
  const onDemoLine = shopHasWrongDemoLine(business);
  const dedicatedLine = shopLines.length > 0 && !onDemoLine;
  const platformLine = process.env.TWILIO_PHONE_NUMBER?.trim() ?? null;

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastCall, lastLead, failedAlerts, recentFailures, lastSuccess, alertMetrics] =
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
      getAlertMetrics(businessId),
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
  const alertSpeedOk =
    alertMetrics.alertLatencyP95Sec === null ||
    alertMetrics.alertLatencyP95Sec <= 60;

  const checks: ShopHealthCheck[] = [
    {
      id: "line",
      label: "Dedicated shop line",
      ok: lineOk && !onDemoLine,
      detail: onDemoLine
        ? `On marketing demo line — Re-sync in Settings for ${business.name}`
        : lineOk
          ? line!
          : platformLine
            ? "No dedicated line — Re-sync in Settings"
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
      id: "alert-speed",
      label: "Alert speed",
      ok: alertSpeedOk && alertMetrics.stuckPendingAlerts === 0,
      detail:
        alertMetrics.alertLatencyP95Sec != null
          ? `P95 ${alertMetrics.alertLatencyP95Sec}s to owner (target ≤60s)`
          : alertMetrics.pendingAlerts > 0
            ? `${alertMetrics.pendingAlerts} alert(s) queued`
            : "No recent deliveries to measure yet",
    },
    {
      id: "alert-queue",
      label: "Alert queue",
      ok: alertMetrics.stuckPendingAlerts === 0,
      detail:
        alertMetrics.stuckPendingAlerts > 0
          ? `${alertMetrics.stuckPendingAlerts} alert(s) stuck over 5 minutes`
          : alertMetrics.pendingAlerts > 0
            ? `${alertMetrics.pendingAlerts} sending now`
            : "Clear",
    },
  ];

  const criticalFailed = !lineOk || !assistantOk;
  const attentionFailed =
    !lineVerified ||
    failedAlerts > 0 ||
    ownerPhoneConflict ||
    (smsEnabled && !ownerPhoneOk) ||
    alertMetrics.stuckPendingAlerts > 0 ||
    !alertSpeedOk;

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
    pendingAlerts: alertMetrics.pendingAlerts,
    stuckPendingAlerts: alertMetrics.stuckPendingAlerts,
    alertLatencyP50Sec: alertMetrics.alertLatencyP50Sec,
    alertLatencyP95Sec: alertMetrics.alertLatencyP95Sec,
    alertSpeedOk,
    recentFailures: recentFailures.map((item) => ({
      channel: item.channel,
      error: item.error,
      createdAt: item.createdAt.toISOString(),
    })),
  };
}
