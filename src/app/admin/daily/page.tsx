"use client";

import { OsShell } from "@/components/os-shell";
import { ShellBadge, ShellPanel } from "@/components/shell-primitives";
import {
  fillOutreachTemplate,
  outreachTemplates,
} from "@/lib/outreach-templates";
import Link from "next/link";
import { useEffect, useState } from "react";

type GateSnapshot = {
  checkoutReady: boolean;
  entitled: boolean;
  billingStatus: string;
  certDone: number;
  baselineReady: boolean;
  proofFresh: boolean;
  wedgeReady: boolean;
};

type Prospect = {
  id: string;
  email: string;
  businessName: string | null;
  phone: string | null;
  status: string;
  nextActionAt: string | null;
};

/**
 * Founder morning run — one URL for domination execution.
 */
export default function AdminDailyPage() {
  const [gates, setGates] = useState<GateSnapshot | null>(null);
  const [due, setDue] = useState<Prospect[]>([]);
  const [touchesToday, setTouchesToday] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(20);
  const [overdueCount, setOverdueCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [accountRes, waitRes] = await Promise.all([
        fetch("/api/account"),
        fetch("/api/waitlist"),
      ]);

      if (accountRes.ok) {
        const data = await accountRes.json();
        let certDone = 0;
        try {
          const parsed = data.business?.founderCertJson
            ? (JSON.parse(data.business.founderCertJson) as boolean[])
            : [];
          if (Array.isArray(parsed)) certDone = parsed.filter(Boolean).length;
        } catch {
          certDone = 0;
        }
        const proofAt = data.business?.lastWeeklyProofAt
          ? new Date(data.business.lastWeeklyProofAt).getTime()
          : 0;
        setGates({
          checkoutReady: Boolean(data.billing?.configured),
          entitled: Boolean(data.billing?.entitled),
          billingStatus: data.billing?.status ?? "none",
          certDone,
          baselineReady: Boolean(
            data.business?.avgTicketCents &&
              data.business?.baselineMissedCallsPerWeek != null &&
              data.business?.baselineJobsPerWeek != null,
          ),
          proofFresh:
            proofAt > 0 && Date.now() - proofAt <= 7 * 24 * 60 * 60 * 1000,
          wedgeReady: Boolean(data.wedge?.ready),
        });
      }

      if (waitRes.ok) {
        const data = await waitRes.json();
        setTouchesToday(data.touchesTodayCount ?? 0);
        setDailyTarget(data.dailyTarget ?? 20);
        setOverdueCount(data.overdueCount ?? 0);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const entries = (data.entries ?? []) as Prospect[];
        setDue(
          entries
            .filter((e) => {
              if (!e.nextActionAt) return e.status === "new";
              return new Date(e.nextActionAt).getTime() <= Date.now();
            })
            .slice(0, 15),
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function logTouch(id: string, status: string) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    await fetch("/api/waitlist", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        lastContactedAt: new Date().toISOString(),
        nextActionAt: next.toISOString(),
        status: status === "new" ? "contacted" : status,
      }),
    });
    setNote("Touch logged");
    await load();
  }

  const underTarget = touchesToday < dailyTarget;

  return (
    <OsShell
      title="Daily run"
      subtitle="Multi-b execution — gates, cash, then 20 touches."
      actions={
        <Link href="/admin" className="btn btn-secondary text-sm">
          Full admin
        </Link>
      }
    >
      <ShellPanel title="1 · Launch gates">
        {loading || !gates ? (
          <p className="font-sans text-sm text-ash">Loading…</p>
        ) : (
          <ul className="space-y-2 font-sans text-sm">
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Phone cert {gates.certDone}/5{" "}
                {gates.certDone >= 5 ? "✓" : "— blocking outreach claims"}
              </span>
              <Link href="/dashboard/settings#founder-cert" className="btn btn-secondary text-xs">
                Certify
              </Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Stripe checkout {gates.checkoutReady ? "ready" : "blocked"} · status{" "}
                {gates.billingStatus}
              </span>
              <Link href="/dashboard/billing" className="btn btn-void text-xs">
                Unblock / pay
              </Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Baseline {gates.baselineReady ? "set" : "missing"} · proof{" "}
                {gates.proofFresh ? "fresh" : "due"}
              </span>
              <Link href="/dashboard" className="btn btn-secondary text-xs">
                Economics
              </Link>
            </li>
            <li className="flex flex-wrap items-center justify-between gap-2">
              <span>Wedge {gates.wedgeReady ? "ready" : "not ready"}</span>
              <Link href="/dashboard/settings" className="btn btn-secondary text-xs">
                Settings
              </Link>
            </li>
          </ul>
        )}
      </ShellPanel>

      <div className="mt-6">
        <ShellPanel title="2 · Distribution (20 touches)">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-sm text-ash">
              Overdue {overdueCount} · due queue below. Hit the number before building features.
            </p>
            <ShellBadge tone={underTarget || overdueCount > 0 ? "flare" : "live"}>
              {touchesToday}/{dailyTarget}
            </ShellBadge>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {outreachTemplates.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn btn-secondary text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(t.body);
                  setNote(`Copied ${t.label}`);
                }}
              >
                Copy {t.label}
              </button>
            ))}
            <Link href="/admin" className="btn btn-secondary text-xs">
              Import CSV
            </Link>
          </div>
          {note ? <p className="mt-2 font-sans text-xs text-live">{note}</p> : null}
          {due.length === 0 ? (
            <p className="mt-4 font-sans text-sm text-ash">
              No due prospects. Import a CSV on Admin or add owners via /pilot.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {due.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-rule bg-fog/40 p-3 font-sans text-sm"
                >
                  <p className="font-semibold text-void">
                    {p.businessName ?? p.email}
                  </p>
                  <p className="text-xs text-ash">
                    {p.email}
                    {p.phone ? ` · ${p.phone}` : ""} · {p.status}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-void text-xs"
                      onClick={() => logTouch(p.id, p.status)}
                    >
                      Logged touch
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-xs"
                      onClick={async () => {
                        const body = fillOutreachTemplate(
                          outreachTemplates.find((t) => t.id === "cold_dm")!.body,
                          {
                            name: p.businessName?.split(" ")[0],
                            business: p.businessName ?? undefined,
                          },
                        );
                        await navigator.clipboard.writeText(body);
                        setNote(`DM ready for ${p.businessName ?? p.email}`);
                      }}
                    >
                      Copy DM
                    </button>
                    {p.phone ? (
                      <a href={`tel:${p.phone}`} className="btn btn-secondary text-xs">
                        Call
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ShellPanel>
      </div>

      <div className="mt-6">
        <ShellPanel title="3 · Shop truth">
          <p className="font-sans text-sm text-ash">
            After touches: verify Summit line, copy weekly proof, close open money on Today.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard" className="btn btn-void text-sm">
              Open Today
            </Link>
            <Link href="/dashboard/billing" className="btn btn-secondary text-sm">
              Billing
            </Link>
          </div>
        </ShellPanel>
      </div>
    </OsShell>
  );
}
