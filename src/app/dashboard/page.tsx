"use client";

import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <OsShell
      title="Command center"
      subtitle="What needs you — ranked by urgency and field impact."
      actions={
        <Link href="/dashboard/ask" className="btn btn-void text-sm">
          Ops copilot
        </Link>
      }
    >
      <Ring1CommandCenter />
    </OsShell>
  );
}
