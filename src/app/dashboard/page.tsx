"use client";

import { ShopAreaCard } from "@/components/shop-area-card";
import { ShopOperateBanner } from "@/components/shop-operate-banner";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { SampleDay } from "@/components/sample-day";
import { OsShell } from "@/components/os-shell";
import { useSession } from "next-auth/react";
import { Suspense } from "react";

/**
 * Signed-in Command — owner OS only.
 * Founder multi-b gates live on /admin/daily, not stacked above the shop pulse.
 * First-night pending clears inside ShopOperateBanner — no click gate.
 */
export default function DashboardPage() {
  const { status } = useSession();
  if (status === "unauthenticated") {
    return (
      <OsShell title="Command">
        <SampleDay />
      </OsShell>
    );
  }
  return (
    <OsShell title="Command">
      <Ring1CommandCenter
        setup={
          <Suspense fallback={null}>
            <ShopOperateBanner />
            <ShopAreaCard />
          </Suspense>
        }
      />
    </OsShell>
  );
}
