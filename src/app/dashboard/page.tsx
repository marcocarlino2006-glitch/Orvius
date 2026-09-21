"use client";

import { FounderNextGate } from "@/components/founder-next-gate";
import { FirstNightHandoff } from "@/components/first-night-handoff";
import { ShopOperateBanner } from "@/components/shop-operate-banner";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <OsShell title="Command">
      <Suspense fallback={null}>
        <FirstNightHandoff />
      </Suspense>
      <FounderNextGate />
      <Suspense fallback={null}>
        <ShopOperateBanner />
      </Suspense>
      <Ring1CommandCenter />
    </OsShell>
  );
}
