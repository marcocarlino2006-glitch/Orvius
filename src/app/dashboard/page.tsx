"use client";

import { FounderNextGate } from "@/components/founder-next-gate";
import { FirstNightHandoff } from "@/components/first-night-handoff";
import { ShopOperateBanner } from "@/components/shop-operate-banner";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <OsShell
      title="Command"
      actions={
        <Link href="/dashboard/ask" className="btn btn-void text-sm">
          Ask
        </Link>
      }
    >
      <Suspense fallback={null}>
        <FirstNightHandoff />
      </Suspense>
      <FounderNextGate />
      <ShopOperateBanner />
      <Ring1CommandCenter />
    </OsShell>
  );
}
