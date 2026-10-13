import type { Metadata } from "next";
import Link from "next/link";

import { WeeklyEmailToggle } from "@/components/weekly-email-toggle";
import { prisma } from "@/lib/prisma";
import { verifyWeeklyEmailToken } from "@/lib/weekly-email-optout";

export const metadata: Metadata = {
  title: "Monday email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const businessId = verifyWeeklyEmailToken(token);
  const shop = businessId
    ? await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, weeklyEmailOffAt: true } })
    : null;
  return (
    <main className="ov-signin ov-signin--verify">
      {shop ? (
        <WeeklyEmailToggle token={token} shopName={shop.name} initiallyOn={!shop.weeklyEmailOffAt} />
      ) : (
        <div className="ov-signin-verify">
          <h1>That link isn&apos;t valid.</h1>
          <p>Open the link at the bottom of your latest Monday email again.</p>
          <Link className="ov-signin-submit" href="/signin">
            Sign in
          </Link>
        </div>
      )}
    </main>
  );
}
