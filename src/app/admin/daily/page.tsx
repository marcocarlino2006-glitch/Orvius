"use client";

import { OsShell } from "@/components/os-shell";
import { ShellBadge } from "@/components/shell-primitives";
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

/** The founder's readiness checklist, in order, with outreach below it. */
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
      title="Checklist"
      subtitle="What stands between here and ready to sell, in order."
      actions={
        <Link href="/admin" className="btn btn-secondary text-sm">
          Admin
        </Link>
      }
    >
      <div className="adm">
        <section className="card" aria-label="Readiness checklist">
          <div className="adm-head">
            <div>
              <p className="home-os-kicker">Readiness{mastery?.shopName ? ` · ${mastery.shopName}` : ""}</p>
              <h2>{mastery ? `${mastery.passed} of ${mastery.total} steps done` : "Readiness"}</h2>
            </div>
            {mastery ? (
              <ShellBadge tone={mastery.mastered ? "live" : "flare"}>
                {mastery.mastered ? "Ready" : `${mastery.total - mastery.passed} open`}
              </ShellBadge>
            ) : null}
          </div>

          {loading ? (
            <p className="adm-empty">Loading…</p>
          ) : !mastery ? (
            <p className="adm-empty">Sign in with the founder email to load the checklist.</p>
          ) : (
            <>
              {next ? (
                <div className="adm-next">
                  <p className="adm-next-kicker">Next</p>
                  <p className="adm-next-title">
                    {next.step}. {next.title}
                  </p>
                  <p className="adm-sub">{next.action}</p>
                  {next.href ? (
                    <Link href={next.href} className="btn btn-void adm-next-cta text-xs">
                      Open
                    </Link>
                  ) : null}
                </div>
              ) : (
                <p className="adm-note adm-note--ok">
                  Every ordered gate is clear. Keep the beyond check green and re-verify the live line before any public claim.
                </p>
              )}

              <GateList gates={mastery.gates.filter((g) => g.id !== "beyond_laws")} />
              {mastery.gates.some((g) => g.id === "beyond_laws") ? (
                <>
                  <p className="adm-group-title adm-standing">Always on</p>
                  <GateList gates={mastery.gates.filter((g) => g.id === "beyond_laws")} />
                </>
              ) : null}
              <p className="adm-sub">
                From a terminal: <code>npm run master:all</code>
              </p>
            </>
          )}
        </section>

        <section className="card" aria-label="Outreach today">
          <div className="adm-head">
            <div>
              <p className="home-os-kicker">Outreach</p>
              <h2>Today&apos;s touches</h2>
              <p className="adm-sub">
                {overdueCount > 0 ? `${overdueCount} overdue · ` : ""}
                Target {dailyTarget} a day once the checklist above allows it.
              </p>
            </div>
            <ShellBadge tone={underTarget || overdueCount > 0 ? "flare" : "live"}>
              {touchesToday}/{dailyTarget}
            </ShellBadge>
          </div>
          <div className="adm-actions">
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
            <Link href="/admin?tab=growth" className="btn btn-secondary text-xs">
              Import CSV
            </Link>
          </div>
          {note ? <p className="adm-note adm-note--ok" role="status">{note}</p> : null}
          {due.length === 0 ? (
            <p className="adm-empty">No prospects are due. Import a CSV on the Growth tab to fill the board.</p>
          ) : (
            <ul className="adm-rows">
              {due.map((p) => (
                <li key={p.id} className="adm-gate">
                  <div className="adm-gate-main">
                    <p className="adm-check-title">{p.businessName ?? p.email}</p>
                    <p className="adm-check-fix">
                      {p.email}
                      {p.phone ? ` · ${p.phone}` : ""} · {p.status}
                    </p>
                  </div>
                  <div className="adm-gate-side">
                    <button type="button" className="btn btn-void text-xs" onClick={() => logTouch(p.id, p.status)}>
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
        </section>
      </div>
    </OsShell>
  );
}

function GateList({ gates }: { gates: MasteryGate[] }) {
  return (
    <ul className="adm-rows adm-checks">
      {gates.map((g) => (
        <li key={g.id} className="adm-gate">
          <div className="adm-gate-main">
            <p className="adm-check-title">
              {g.id === "beyond_laws" ? g.title : `${g.step}. ${g.title}`}
            </p>
            <p className="adm-check-fix">
              {g.detail}
              {g.owner === "founder" ? " · founder" : ""}
            </p>
          </div>
          <div className="adm-gate-side">
            <ShellBadge tone={g.ok ? "live" : "flare"}>{g.ok ? "Done" : "Open"}</ShellBadge>
            {g.href && !g.ok ? (
              <Link href={g.href} className="btn btn-secondary text-xs">
                Fix
              </Link>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
