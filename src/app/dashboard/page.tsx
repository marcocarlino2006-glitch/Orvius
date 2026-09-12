"use client";

import { OwnerSetupBanner } from "@/components/owner-setup-banner";
import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

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
      <OwnerSetupBanner />
      <Ring1CommandCenter />
    </OsShell>
  );
}
