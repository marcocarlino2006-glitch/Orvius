"use client";

import { FirstNightHandoff } from "@/components/first-night-handoff";
import { ShopOperateBanner } from "@/components/shop-operate-banner";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import { Suspense } from "react";

/**
 * Signed-in Command — owner OS only.
 * Founder multi-b gates live on /admin/daily, not stacked above the shop pulse.
 */
export default function DashboardPage() {
  return (
    <OsShell title="Command">
      <Suspense fallback={null}>
        <FirstNightHandoff />
      </Suspense>
      <Suspense fallback={null}>
        <ShopOperateBanner />
      </Suspense>
      <Ring1CommandCenter />
    </OsShell>
  );
}
