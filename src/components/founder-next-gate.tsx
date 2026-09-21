"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type MasteryGate = {
  id: string;
  step: number;
  title: string;
  action: string;
  href?: string;
  ok: boolean;
};

type MasteryReport = {
  next: MasteryGate | null;
  passed: number;
  total: number;
  mastered: boolean;
  founder?: boolean;
};

/**
 * Operate first principle O1: the next red gate must be impossible to miss.
 * Founders see it on Command; owners never see multi-b jargon.
 */
export function FounderNextGate() {
  const [report, setReport] = useState<MasteryReport | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/mastery");
        if (!res.ok) return;
        const data = (await res.json()) as MasteryReport;
        if (!cancelled) setReport(data);
      } catch {
        /* silent — Command still works without mastery */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!report?.founder || report.mastered || !report.next) return null;

  const next = report.next;

  return (
    <aside
      className="founder-next-gate font-sans"
      aria-label="Next multi-b gate"
    >
      <div className="founder-next-gate-copy">
        <p className="founder-next-gate-kicker">
          Next gate · {report.passed}/{report.total}
        </p>
        <p className="founder-next-gate-title">
          {next.step}. {next.title}
        </p>
        <p className="founder-next-gate-action">{next.action}</p>
      </div>
      <div className="founder-next-gate-actions">
        {next.href ? (
          <Link href={next.href} className="btn btn-void text-sm">
            Close it
          </Link>
        ) : (
          <Link href="/admin/daily" className="btn btn-void text-sm">
            Open daily
          </Link>
        )}
      </div>
    </aside>
  );
}
