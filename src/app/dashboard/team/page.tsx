"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddTechnician, CrewMember, parseSkills, type CrewTech } from "@/components/crew-editor";
import { OsShell } from "@/components/os-shell";
import { PlanUpgradeGate } from "@/components/plan-upgrade-gate";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { StatusDot } from "@/components/status-dot";
import { TeamAccessGroup } from "@/components/settings-center/team-access-group";
import { displayPhone } from "@/lib/customer";
import type { Trade } from "@/lib/trades";
import { formatWhen } from "@/lib/when";

type Destination =
  | { state: "verified"; at: string }
  | { state: "failing"; at: string }
  | { state: "unverified" }
  | { state: "missing" };

type TeamTech = CrewTech & {
  openJobs: number;
  nextJob: { id: string; title: string; scheduledAt: string | null } | null;
  destination: Destination;
};

type CrewData = { crew: TeamTech[]; timezone: string; today: string; trade: string | null };

function destinationLine(tech: TeamTech) {
  const d = tech.destination;
  const phone = tech.phone ? displayPhone(tech.phone) : null;
  if (d.state === "missing") return { tone: "risk" as const, label: "No mobile", detail: "Job texts can't reach them. Add a mobile below." };
  if (d.state === "verified") return { tone: "good" as const, label: "Verified", detail: `Job texts to ${phone} have been delivered.` };
  if (d.state === "failing") return { tone: "risk" as const, label: "Not delivering", detail: `The last job text to ${phone} didn't arrive. Check the number.` };
  return { tone: "neutral" as const, label: "Not verified yet", detail: `Job texts go to ${phone}. None has been confirmed delivered yet.` };
}

function CrewOverview({ tech, timezone }: { tech: TeamTech; timezone: string }) {
  const dest = destinationLine(tech);
  const skills = parseSkills(tech.skillsJson);
  const off = tech.timeOff?.[0];
  return (
    <div className="tm-tech-summary">
      <p className="tm-tech-name">{tech.name}</p>
      <p className="tm-tech-line">
        <StatusDot tone={dest.tone}>{dest.label}</StatusDot>
        <span className="tm-muted">{dest.detail}</span>
      </p>
      <p className="tm-tech-line">
        <span className="tm-k">Skills</span>
        <span>{skills.length ? skills.map((s) => s.replace(/_/g, " ")).join(", ") : "Takes any job"}</span>
      </p>
      <p className="tm-tech-line">
        <span className="tm-k">Assigned</span>
        <span>
          {tech.openJobs ? `${tech.openJobs} open` : "Nothing open"}
          {tech.nextJob ? (
            <>
              {" · next "}
              <Link href={`/dashboard/jobs/${tech.nextJob.id}`}>{tech.nextJob.title}</Link>
              {tech.nextJob.scheduledAt ? ` ${formatWhen(tech.nextJob.scheduledAt)}` : ""}
            </>
          ) : null}
        </span>
      </p>
      {off ? (
        <p className="tm-tech-line">
          <span className="tm-k">Time off</span>
          <span>
            {new Date(off.startsAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone })}
            {off.reason ? ` · ${off.reason}` : ""}
          </span>
        </p>
      ) : null}
    </div>
  );
}

export default function TeamPage() {
  const [data, setData] = useState<CrewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch("/api/team/crew", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 402 || res.status === 403) return null;
        if (!res.ok) throw new Error(res.status === 401 ? "Your session expired. Sign in again." : "The crew didn't load. Nothing changed; try again.");
        return res.json();
      })
      .then((json) => json && setData(json))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const crew = data?.crew ?? [];

  return (
    <OsShell title="Team" subtitle="Who can do what">
      <p className="pg-purpose font-sans">
        People who sign in to Orvius, what each is allowed to do, and the crew Orvius assigns work to — with their skills,
        hours and where job texts go.
      </p>

      <section className="tm-section" aria-labelledby="tm-access">
        <h2 id="tm-access" className="tm-h">
          Sign-in access and permissions
        </h2>
        <TeamAccessGroup />
      </section>

      <section className="tm-section" aria-labelledby="tm-crew">
        <h2 id="tm-crew" className="tm-h">
          Crew {data ? <span className="tm-count">{crew.length}</span> : null}
        </h2>
        <PlanUpgradeGate module="dispatch">
          {error ? (
            <div className="ox-state ox-state--failure ox-state--inline" role="alert">
              <p className="ox-state-title">Crew not loaded</p>
              <p className="ox-state-copy">{error}</p>
              <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" onClick={load}>
                Retry
              </button>
            </div>
          ) : null}
          {loading && !data ? (
            <div className="tm-loading" aria-busy>
              <span className="skeleton" style={{ width: "50%", height: 14 }} />
              <span className="skeleton" style={{ width: "80%", height: 14 }} />
            </div>
          ) : data ? (
            <>
              {!crew.length ? (
                <ProEmptyState
                  title="No one on the crew yet"
                  body="Add the people who do the work. Orvius assigns each booking to someone with the right skill who is working that day, and texts them the job."
                />
              ) : (
                <p className="tm-help">
                  Orvius assigns each booking to someone with the right skill who&apos;s working. Leave skills empty to let someone take any job.
                </p>
              )}
              <ul className="tm-crew">
                {crew.map((tech) => (
                  <li key={`${tech.id}-${tech.skillsJson}-${tech.phone}`} className="tm-tech">
                    <CrewOverview tech={tech} timezone={data.timezone} />
                    <details className="tm-edit">
                      <summary>Edit {tech.name.split(" ")[0]}: phone, skills, hours</summary>
                      <CrewMember tech={tech} trade={(data.trade ?? null) as Trade | null} timezone={data.timezone} today={data.today} onSaved={load} />
                    </details>
                  </li>
                ))}
              </ul>
              <AddTechnician onAdded={load} />
            </>
          ) : null}
        </PlanUpgradeGate>
      </section>

      <section className="tm-section" aria-labelledby="tm-alerts">
        <h2 id="tm-alerts" className="tm-h">
          Owner alerts
        </h2>
        <p className="tm-help">
          Where Orvius sends urgent calls and failures, and the test that proves they arrive, live in{" "}
          <Link href="/dashboard/settings?settings=notifications">Settings → Escalation</Link>.
        </p>
      </section>
    </OsShell>
  );
}
