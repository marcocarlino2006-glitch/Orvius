"use client";

import Link from "next/link";
import { ShellBadge, ShellPanel } from "@/components/shell-primitives";
import { demandCategoryLabel } from "@/lib/job-taxonomy";

function formatUrgency(value: string | null | undefined) {
  if (!value?.trim()) return null;
  return value.trim().replace(/[-_]/g, " ");
}

export type AiSituation = {
  understood: {
    customer: string | null;
    phone: string | null;
    address: string | null;
    problem: string | null;
    categoryCode: string | null;
    urgency: string | null;
  };
  actionsTaken: string[];
  why: string[];
  confidence: string | null;
  needsReview: boolean;
  reviewReasons: string[];
  leadId?: string | null;
  jobId?: string | null;
  customerId?: string | null;
};

type AiSituationPanelProps = {
  situation: AiSituation;
  /** tel: target for human takeover */
  takeoverPhone?: string | null;
};

/**
 * Show the owner exactly what Orvius understood, did, why, confidence,
 * and what needs human approval — Manus-grade transparency on the HVAC wedge.
 */
export function AiSituationPanel({
  situation,
  takeoverPhone,
}: AiSituationPanelProps) {
  const { understood, actionsTaken, why, confidence, needsReview, reviewReasons } =
    situation;
  const category =
    demandCategoryLabel(understood.categoryCode) ?? understood.problem;

  return (
    <ShellPanel title="AI situation" dense>
      <div className="ai-situation font-sans">
        <div className="ai-situation-status">
          {needsReview ? (
            <ShellBadge tone="flare">Needs human</ShellBadge>
          ) : (
            <ShellBadge tone="live">Handled</ShellBadge>
          )}
          {confidence ? (
            <span className="ai-situation-confidence">
              Confidence <strong>{confidence}</strong>
              <span className="text-ash"> / 10</span>
            </span>
          ) : (
            <span className="ai-situation-confidence text-ash">
              Confidence not captured
            </span>
          )}
        </div>

        <dl className="ai-situation-understood">
          <div>
            <dt>Understood</dt>
            <dd>
              {[
                category,
                formatUrgency(understood.urgency),
                understood.address,
              ]
                .filter(Boolean)
                .join(" · ") || "Still gathering details"}
            </dd>
          </div>
          <div>
            <dt>Customer</dt>
            <dd>
              {understood.customer || "Unknown"}
              {understood.phone ? ` · ${understood.phone}` : ""}
            </dd>
          </div>
        </dl>

        <div className="ai-situation-block">
          <p className="ai-situation-label">Did</p>
          {actionsTaken.length ? (
            <ul>
              {actionsTaken.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <p className="text-ash">No actions recorded yet.</p>
          )}
        </div>

        {why.length || reviewReasons.length ? (
          <div className="ai-situation-block">
            <p className="ai-situation-label">Why / gaps</p>
            <ul>
              {[...why, ...reviewReasons].map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="ai-situation-actions">
          {situation.leadId ? (
            <Link
              href={`/dashboard/inbox/${situation.leadId}`}
              className="btn btn-void text-sm"
            >
              {needsReview ? "Take over lead" : "Open lead"}
            </Link>
          ) : null}
          {takeoverPhone ? (
            <a href={`tel:${takeoverPhone}`} className="btn btn-secondary text-sm">
              Call customer
            </a>
          ) : null}
          {situation.jobId ? (
            <Link
              href={`/dashboard/jobs/${situation.jobId}`}
              className="btn btn-ghost text-sm"
            >
              View job
            </Link>
          ) : null}
          {situation.customerId ? (
            <Link
              href={`/dashboard/customers/${situation.customerId}`}
              className="btn btn-ghost text-sm"
            >
              Customer
            </Link>
          ) : null}
        </div>
      </div>
    </ShellPanel>
  );
}
