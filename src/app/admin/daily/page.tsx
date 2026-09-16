"use client";

import { OsShell } from "@/components/os-shell";
import { ShellBadge, ShellPanel } from "@/components/shell-primitives";
import {
  fillOutreachTemplate,
  outreachTemplates,
} from "@/lib/outreach-templates";
import Link from "next/link";
import { useEffect, useState } from "react";

type MasteryGate = {
  id: string;
  step: number;
  title: string;
  owner: string;
  doneWhen: string;
  action: string;
  href?: string;
  ok: boolean;
  detail: string;
};

type MasteryReport = {
  gates: MasteryGate[];
  passed: number;
  total: number;
  next: MasteryGate | null;
  mastered: boolean;
  shopName: string | null;
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
 * Founder mastery cockpit — close every multi-b gate in order.
 * Distribution run sits below the scorecard; never skip a red gate above.
 */
export default function AdminDailyPage() {
  const [mastery, setMastery] = useState<MasteryReport | null>(null);
  const [due, setDue] = useState<Prospect[]>([]);
  const [touchesToday, setTouchesToday] = useState(0);
  const [dailyTarget, setDailyTarget] = useState(20);
  const [overdueCount, setOverdueCount] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [masteryRes, waitRes] = await Promise.all([
        fetch("/api/admin/mastery"),
        fetch("/api/waitlist"),
      ]);

      if (masteryRes.ok) {
        setMastery(await masteryRes.json());
      } else {
        setMastery(null);
      }

      if (waitRes.ok) {
        const data = await waitRes.json();
        setTouchesToday(data.touchesTodayCount ?? 0);
        setDailyTarget(data.dailyTarget ?? 20);
        setOverdueCount(data.overdueCount ?? 0);
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
  const next = mastery?.next ?? null;

  return (
    <OsShell
      title="Master all"
      subtitle="Multi-b close sequence — one red gate at a time. No skipping."
      actions={
        <Link href="/admin" className="btn btn-secondary text-sm">
          Full admin
        </Link>
      }
    >
      <ShellPanel
        title={
          mastery
            ? `Mastery ${mastery.passed}/${mastery.total}${mastery.shopName ? ` · ${mastery.shopName}` : ""}`
            : "Mastery scorecard"
        }
      >
        {loading ? (
          <p className="font-sans text-sm text-ash">Loading…</p>
        ) : !mastery ? (
          <p className="font-sans text-sm text-ash">
            Sign in as founder/owner to load the mastery scorecard.
          </p>
        ) : (
          <>
            {next ? (
              <div className="mb-4 rounded-md border border-flare/40 bg-flare/5 p-3">
                <p className="font-sans text-xs uppercase tracking-wide text-flare">
                  Next — do not skip
                </p>
                <p className="mt-1 font-sans text-sm font-semibold text-void">
                  {next.step}. {next.title}
                </p>
                <p className="mt-1 font-sans text-sm text-ash">{next.action}</p>
                {next.href ? (
                  <Link href={next.href} className="btn btn-void mt-3 text-xs">
                    Open
                  </Link>
                ) : null}
              </div>
            ) : (
              <p className="mb-4 font-sans text-sm text-live">
                Ordered shop gates clear on this snapshot — keep beyond:check green and run live
                cell re-verify before public claims.
              </p>
            )}

            <ul className="space-y-2 font-sans text-sm">
              {mastery.gates.map((g) => (
                <li
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/60 py-2 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-void">
                      {g.ok ? "✓" : "○"} {g.step}. {g.title}
                    </p>
                    <p className="text-xs text-ash">
                      {g.detail}
                      {g.owner === "founder" ? " · founder" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ShellBadge tone={g.ok ? "live" : "flare"}>
                      {g.ok ? "done" : "open"}
                    </ShellBadge>
                    {g.href && !g.ok ? (
                      <Link href={g.href} className="btn btn-secondary text-xs">
                        Fix
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 font-sans text-xs text-ash">
              CLI: <code className="text-void">npm run master:all</code> · Strict list:{" "}
              <code className="text-void">docs/MULTI-B-STRICT.md</code>
            </p>
          </>
        )}
      </ShellPanel>

      <div className="mt-6">
        <ShellPanel title="Distribution run (only after gates above allow)">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-sans text-sm text-ash">
              Overdue {overdueCount} · hit {dailyTarget}/day after cert + cash gates, not before.
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
              No due prospects. Import a real CSV on Admin — replace seeds before live outreach.
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
    </OsShell>
  );
}
