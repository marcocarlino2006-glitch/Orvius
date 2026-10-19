import { launchCapacity, type LaunchCapacity } from "@/lib/launch-capacity";
import { prisma } from "@/lib/prisma";

export type LaunchFunnel = {
  previewsStarted: number;
  previewsCalled: number;
  replaysShared: number;
  replayViews: number;
  shopsTotal: number;
  shopsPaying: number;
  cohort: LaunchCapacity;
};

/**
 * The launch loop, counted from records that already exist: a preview is
 * started, a preview takes a call, the owner shares it as a replay, other
 * owners view it, and shops sign up and pay. Claims are link clicks and are
 * deliberately not counted — nothing about a claim is stored.
 */
export async function getLaunchFunnel(
  client = prisma,
  capacity: () => Promise<LaunchCapacity> = launchCapacity,
): Promise<LaunchFunnel> {
  const [previewsStarted, previewsCalled, replaysShared, views, shopsTotal, shopsPaying, cohort] =
    await Promise.all([
      client.shopPreview.count(),
      client.shopPreview.count({ where: { lastCallAt: { not: null } } }),
      client.callReplay.count(),
      client.callReplay.aggregate({ _sum: { views: true } }),
      client.business.count(),
      client.business.count({ where: { billingStatus: "active" } }),
      capacity(),
    ]);
  return {
    previewsStarted,
    previewsCalled,
    replaysShared,
    replayViews: views._sum.views ?? 0,
    shopsTotal,
    shopsPaying,
    cohort,
  };
}
