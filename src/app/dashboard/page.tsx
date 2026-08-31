"use client";

import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { ProSectionHead } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <OsShell
      title="Overview"
      subtitle="Your line, inbox, and call activity — one operational surface."
      actions={
        <Link href="/dashboard/inbox" className="btn btn-void text-sm">
          Open inbox
        </Link>
      }
    >
      <Ring1CommandCenter />

      <section className="ring1-more pro-section">
        <ProSectionHead kicker="Modules" title="Customers through dispatch" />
        <div className="ring1-more-grid font-sans">
          <Link href="/dashboard/customers" className="ring1-more-card pro-card">
            <span className="ring1-more-num">02</span>
            <span className="ring1-more-label">Customers</span>
            <span className="ring1-more-desc">Records & history</span>
          </Link>
          <Link href="/dashboard/jobs" className="ring1-more-card pro-card">
            <span className="ring1-more-num">03</span>
            <span className="ring1-more-label">Jobs</span>
            <span className="ring1-more-desc">Book & schedule</span>
          </Link>
          <Link href="/dashboard/dispatch" className="ring1-more-card pro-card">
            <span className="ring1-more-num">04</span>
            <span className="ring1-more-label">Dispatch</span>
            <span className="ring1-more-desc">Field board</span>
          </Link>
          <Link href="/dashboard/ask" className="ring1-more-card pro-card">
            <span className="ring1-more-num">↳</span>
            <span className="ring1-more-label">Ask</span>
            <span className="ring1-more-desc">Shop intelligence</span>
          </Link>
        </div>
      </section>
    </OsShell>
  );
}
