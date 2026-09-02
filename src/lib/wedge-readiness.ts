import { getShopHealth, type ShopHealth } from "@/lib/shop-health";
import { ownerPhoneConflictsWithShopLine, getShopLines } from "@/lib/owner-alerts";
import { prisma } from "@/lib/prisma";

export type WedgeReadinessItem = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  actionHref?: string;
};

export type WedgeReadiness = {
  ready: boolean;
  score: number;
  total: number;
  items: WedgeReadinessItem[];
  healthStatus: ShopHealth["status"];
};

export async function getWedgeReadiness(
  businessId: string,
  healthOverride?: ShopHealth,
): Promise<WedgeReadiness> {
  const [business, health, leadCount, jobCount, testAlert] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: {
        ownerPhone: true,
        twilioPhone: true,
        vapiPhoneNumber: true,
        lineVerifiedAt: true,
      },
    }),
    healthOverride ? Promise.resolve(healthOverride) : getShopHealth(businessId),
    prisma.lead.count({ where: { businessId } }),
    prisma.job.count({ where: { businessId, status: { not: "cancelled" } } }),
    prisma.ownerNotification.findFirst({
      where: {
        businessId,
        status: "sent",
        OR: [
          { dedupeKey: { startsWith: "test-alert:" } },
          { dedupeKey: { startsWith: "call:" } },
          { dedupeKey: { startsWith: "sms:" } },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { channel: true, createdAt: true },
    }),
  ]);

  if (!business) {
    throw new Error("Business not found");
  }

  const shopLines = getShopLines(business);
  const ownerPhoneOk =
    Boolean(business.ownerPhone?.trim()) &&
    !ownerPhoneConflictsWithShopLine({
      ownerPhone: business.ownerPhone,
      shopLines,
    });

  const items: WedgeReadinessItem[] = [
    {
      id: "line",
      label: "Dedicated shop line",
      ok: health.dedicatedLine,
      detail: health.line ?? "No line assigned yet",
      actionHref: "/dashboard/settings",
    },
    {
      id: "verified",
      label: "Line tested end-to-end",
      ok: health.lineVerified,
      detail: health.lineVerified
        ? "Completed call reached your inbox"
        : "Place a test call from your cell",
      actionHref: health.line ? undefined : "/dashboard/settings",
    },
    {
      id: "owner-phone",
      label: "Owner mobile configured",
      ok: ownerPhoneOk,
      detail: ownerPhoneOk
        ? business.ownerPhone!
        : "Add your cell — not your shop line",
      actionHref: "/dashboard/settings",
    },
    {
      id: "alert-test",
      label: "Owner alert delivered",
      ok: Boolean(testAlert),
      detail: testAlert
        ? `Last ${testAlert.channel} alert sent`
        : "Send a test alert from Settings",
      actionHref: "/dashboard/settings",
    },
    {
      id: "first-lead",
      label: "First lead in inbox",
      ok: leadCount > 0,
      detail:
        leadCount > 0
          ? `${leadCount} lead${leadCount === 1 ? "" : "s"} on record`
          : "Call your line to create your first lead",
    },
    {
      id: "first-job",
      label: "Lead auto-books to dispatch",
      ok: jobCount > 0,
      detail:
        jobCount > 0
          ? `${jobCount} job${jobCount === 1 ? "" : "s"} on board`
          : "Book or receive a lead — jobs appear automatically",
      actionHref: "/dashboard",
    },
    {
      id: "health",
      label: "Shop health clear",
      ok: health.status !== "critical",
      detail:
        health.status === "healthy"
          ? "All systems go"
          : health.status === "attention"
            ? "Minor fixes recommended"
            : "Critical — fix before going live",
      actionHref: "/dashboard/settings",
    },
  ];

  const score = items.filter((item) => item.ok).length;
  const ready =
    score === items.length &&
    health.status !== "critical" &&
    health.stuckPendingAlerts === 0;

  return {
    ready,
    score,
    total: items.length,
    items,
    healthStatus: health.status,
  };
}
