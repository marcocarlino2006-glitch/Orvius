"use client";

import { Ring1CommandCenter } from "@/components/ring1-command-center";
import { ProSectionHead } from "@/components/pro-page-chrome";
import { OsShell } from "@/components/os-shell";
import Link from "next/link";

const WORKSPACE_LINKS = [
  {
    href: "/dashboard/customers",
    label: "Customers",
    desc: "Every caller on record",
  },
  {
    href: "/dashboard/jobs",
    label: "Jobs",
    desc: "Booked work, not sticky notes",
  },
  {
    href: "/dashboard/dispatch",
    label: "Dispatch",
    desc: "Who goes where today",
  },
  {
    href: "/dashboard/ask",
    label: "Ask",
    desc: "Answers from your shop data",
  },
] as const;

export default function DashboardPage() {
  return (
    <OsShell
      title="Today"
      subtitle="Your line, inbox, and schedule — everything that needs your attention."
      actions={
        <Link href="/dashboard/inbox" className="btn btn-void text-sm">
          Inbox
        </Link>
      }
    >
      <Ring1CommandCenter />

      <section className="ring1-more pro-section">
        <ProSectionHead
          kicker="Workspace"
          title="Run the rest of the shop"
        />
        <div className="ring1-more-grid font-sans">
          {WORKSPACE_LINKS.map((item) => (
            <Link key={item.href} href={item.href} className="ring1-more-card pro-card">
              <span className="ring1-more-label">{item.label}</span>
              <span className="ring1-more-desc">{item.desc}</span>
            </Link>
          ))}
        </div>
      </section>
    </OsShell>
  );
}
