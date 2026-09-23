"use client";

import { FirstNightHandoff } from "@/components/first-night-handoff";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import { Suspense } from "react";

/**
 * Command is the default home. Setup/alerts/proof live in the priority queue —
 * no stacked Next Gate or operate banners above the briefing.
 */
export default function DashboardPage() {
  return (
    <OsShell title="Command">
      <Suspense fallback={null}>
        <FirstNightHandoff />
      </Suspense>
      <Ring1CommandCenter />
    </OsShell>
  );
}
