import { prisma } from "@/lib/prisma";

export type AlertMetrics = {
  pendingAlerts: number;
  stuckPendingAlerts: number;
  alertLatencyP50Sec: number | null;
  alertLatencyP95Sec: number | null;
  lastAlertLatencySec: number | null;
};

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

export async function getAlertMetrics(businessId: string): Promise<AlertMetrics> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60_000);
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60_000);

  const [pendingAlerts, stuckPendingAlerts, recentDeliveries] = await Promise.all([
    prisma.ownerNotification.count({
      where: { businessId, status: "pending" },
    }),
    prisma.ownerNotification.count({
      where: {
        businessId,
        status: "pending",
        createdAt: { lt: fiveMinAgo },
      },
    }),
    prisma.ownerNotification.findMany({
      where: {
        businessId,
        status: "sent",
        leadId: { not: null },
        processedAt: { not: null },
        createdAt: { gte: since7d },
      },
      orderBy: { processedAt: "desc" },
      take: 50,
      select: { leadId: true, processedAt: true },
    }),
  ]);

  const leadIds = [
    ...new Set(
      recentDeliveries
        .map((row) => row.leadId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const leads =
    leadIds.length > 0
      ? await prisma.lead.findMany({
          where: { id: { in: leadIds }, businessId },
          select: { id: true, createdAt: true },
        })
      : [];

  const leadCreated = new Map(leads.map((lead) => [lead.id, lead.createdAt.getTime()]));

  const latencies = recentDeliveries
    .map((row) => {
      if (!row.leadId || !row.processedAt) return null;
      const created = leadCreated.get(row.leadId);
      if (!created) return null;
      return Math.max(0, Math.round((row.processedAt.getTime() - created) / 1000));
    })
    .filter((value): value is number => value !== null);

  return {
    pendingAlerts,
    stuckPendingAlerts,
    alertLatencyP50Sec: percentile(latencies, 50),
    alertLatencyP95Sec: percentile(latencies, 95),
    lastAlertLatencySec: latencies[0] ?? null,
  };
}
