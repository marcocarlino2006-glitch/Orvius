"use client";

import Link from "next/link";
import {
  buildWorkflowStages,
  type CommandToday,
} from "@/lib/command-today";

type CommandWorkflowStripProps = {
  today: CommandToday | null | undefined;
  alertsProven?: boolean;
  loading?: boolean;
};

/**
 * One connected wedge: call → customer → qualify → book → alert → follow-up → paid.
 * Measured stages light up from TODAY facts; waiting stages need the owner.
 */
export function CommandWorkflowStrip({
  today,
  alertsProven = false,
  loading = false,
}: CommandWorkflowStripProps) {
  if (loading || !today) return null;

  const stages = buildWorkflowStages({
    callsToday: today.callsAnswered,
    leadsToday: today.qualifiedLeads,
    jobsToday: today.appointmentsBooked,
    unresolved: today.unresolved,
    urgentOpen: today.urgentOpen,
    collectedCents: today.collectedCents,
    alertsProven,
  });

  return (
    <section
      className="command-workflow font-sans"
      aria-label="HVAC capture workflow"
    >
      <header className="command-workflow-head">
        <p className="command-workflow-kicker">Wedge loop</p>
        <p className="command-workflow-title">
          Call → qualify → book → alert → paid
        </p>
      </header>
      <ol className="command-workflow-stages">
        {stages.map((stage, index) => (
          <li key={stage.id} className={`command-workflow-stage is-${stage.state}`}>
            {index > 0 ? (
              <span className="command-workflow-rail" aria-hidden />
            ) : null}
            <Link href={stage.href} className="command-workflow-node">
              <span className="command-workflow-label">{stage.label}</span>
              {stage.count != null ? (
                <span className="command-workflow-count">{stage.count}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
