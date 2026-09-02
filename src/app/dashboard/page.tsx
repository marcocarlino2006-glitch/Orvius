"use client";

import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <OsShell
      title="Today"
      subtitle="What needs you — leads, jobs, and the line."
      actions={
        <Link href="/dashboard/inbox" className="btn btn-void text-sm">
          Inbox
        </Link>
      }
    >
      <Ring1CommandCenter />
    </OsShell>
  );
}
