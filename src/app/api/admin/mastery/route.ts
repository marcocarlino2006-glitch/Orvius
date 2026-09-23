import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { company } from "@/lib/company";
import { isFounderEmail } from "@/lib/founder";
import {
  buildManusPostStatus,
  MANUS_POST_STEPS,
  probeManusEnvSecrets,
  resolveManusPostNext,
} from "@/lib/manus-post";
import { prisma } from "@/lib/prisma";
import {
  buildMasteryReport,
  connectReadyFromBusiness,
  looksLikeSeedProspect,
} from "@/lib/multi-b-mastery";
import { probeProdTelephony } from "@/lib/prod-telephony";
import { probeProdBilling } from "@/lib/prod-billing";
import { getWedgeReadiness } from "@/lib/wedge-readiness";
import { getBusinessForOwnerWithAutoLine } from "@/lib/provision-business";

/**
 * Founder mastery scorecard — ordered multi-b gates.
 * Auth: signed-in founder (or owner session for their shop snapshot).
 */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await getBusinessForOwnerWithAutoLine(email).catch(() => null);

  let certDone = 0;
  try {
    const parsed = business?.founderCertJson
      ? (JSON.parse(business.founderCertJson) as boolean[])
      : [];
    if (Array.isArray(parsed)) certDone = parsed.filter(Boolean).length;
  } catch {
    certDone = 0;
  }

  const proofAt = business?.lastWeeklyProofAt
    ? new Date(business.lastWeeklyProofAt).getTime()
    : 0;
  const proofFresh =
    proofAt > 0 && Date.now() - proofAt <= 7 * 24 * 60 * 60 * 1000;

  const baselineReady = Boolean(
    business?.avgTicketCents &&
      business?.baselineMissedCallsPerWeek != null &&
      business?.baselineJobsPerWeek != null,
  );

  let wedgeReady = false;
  let wedgeItems: Awaited<ReturnType<typeof getWedgeReadiness>>["items"] = [];
  if (business?.id) {
    try {
      const wedge = await getWedgeReadiness(business.id);
      wedgeReady = Boolean(wedge?.ready);
      wedgeItems = wedge?.items ?? [];
    } catch {
      wedgeReady = false;
    }
  }

  const waitlist = await prisma.waitlistEntry
    .findMany({
      select: {
        email: true,
        status: true,
        nextActionAt: true,
        lastContactedAt: true,
      },
      take: 500,
    })
    .catch(() => []);

  const seedsOnly =
    waitlist.length === 0 ||
    waitlist.every((e) => looksLikeSeedProspect(e.email));

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const touchesToday = waitlist.filter(
    (e) =>
      e.lastContactedAt && new Date(e.lastContactedAt).getTime() >= start.getTime(),
  ).length;
  const overdueCount = waitlist.filter((e) => {
    if (!e.nextActionAt) return e.status === "new";
    return new Date(e.nextActionAt).getTime() < start.getTime();
  }).length;

  const provingShops = await prisma.business
    .count({
      where: {
        OR: [
          { billingStatus: { in: ["active", "past_due"] } },
          { lastWeeklyProofAt: { not: null } },
        ],
        NOT: { slug: { startsWith: "journey-" } },
      },
    })
    .catch(() => 0);

  const report = buildMasteryReport({
    certDone,
    wedgeReady,
    baselineReady,
    proofFresh,
    connectReady: connectReadyFromBusiness(business),
    provingShops,
    touchesToday,
    dailyTarget: 20,
    overdueCount,
    seedsOnly,
    /* External proof stays manual until a dedicated field ships. */
    externalProof: false,
  });

  const itemOk = (id: string) =>
    wedgeItems.find((i) => i.id === id)?.ok ?? null;

  const prodTel = await probeProdTelephony();
  const prodBilling = await probeProdBilling();
  const manusStatus = buildManusPostStatus({
    secrets: probeManusEnvSecrets(process.env, {
      prodTelephonyOk: prodTel.ok,
      prodBillingOk: prodBilling.ok,
    }),
    wedgeLine: itemOk("line"),
    wedgeVerify: itemOk("verified"),
    wedgeAlert: itemOk("alert-test"),
    phoneCertDone: certDone >= 5,
    proofVideo: null,
    formation: Boolean(company.formationStateConfirmed),
    bulletproof: null,
  });
  const manusNext = resolveManusPostNext(manusStatus);

  return NextResponse.json({
    ...report,
    founder: isFounderEmail(email),
    shopName: business?.name ?? null,
    manusPost: {
      steps: MANUS_POST_STEPS.map((step) => ({
        ...step,
        ok: manusStatus[step.id] ?? null,
      })),
      next: manusNext,
      cli: "npm run manus:post",
    },
  });
}
