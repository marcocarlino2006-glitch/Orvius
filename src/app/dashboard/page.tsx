"use client";

import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

export default function DashboardPage() {
  return (
    <OsShell
      title="Front door"
      subtitle="Ring 1 — answer, qualify, alert. The wedge that never sleeps."
      businessName="Summit HVAC"
      actions={
        <Link href="/dashboard/inbox" className="btn btn-void text-sm">
          Open inbox
        </Link>
      }
    >
      <Ring1CommandCenter />

      <section className="ring1-more pro-section">
        <div className="pro-section-head">
          <div>
            <p className="pro-section-kicker font-sans">Rings 2–4</p>
            <h3 className="pro-section-title font-serif">Deeper in the OS</h3>
          </div>
        </div>
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
          <Link href="/dashboard/calls" className="ring1-more-card pro-card">
            <span className="ring1-more-num">↳</span>
            <span className="ring1-more-label">Call log</span>
            <span className="ring1-more-desc">Every conversation</span>
          </Link>
        </div>
      </section>
    </OsShell>
  );
}
