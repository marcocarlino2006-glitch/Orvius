"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { ClarityPurpose, WorkflowTrailLink } from "@/lib/clarity";

type ClarityPurposeBarProps = {
  purpose: ClarityPurpose;
  className?: string;
};

/**
 * Four-question guidance strip — what / happening / next / consequence.
 * Calm, high-signal, never decorative.
 */
export function ClarityPurposeBar({
  purpose,
  className = "",
}: ClarityPurposeBarProps) {
  return (
    <aside
      className={`clarity-purpose font-sans ${className}`.trim()}
      aria-label="What this page is for"
    >
      <p className="clarity-purpose-what">{purpose.what}</p>
      {purpose.happening ? (
        <p className="clarity-purpose-row">
          <span className="clarity-purpose-label">Happening</span>
          <span>{purpose.happening}</span>
        </p>
      ) : null}
      {purpose.next ? (
        <p className="clarity-purpose-row clarity-purpose-next">
          <span className="clarity-purpose-label">Next</span>
          <span>
            {purpose.next}
            {purpose.primaryHref && purpose.primaryLabel ? (
              <>
                {" "}
                {purpose.primaryHref.startsWith("/") ? (
                  <Link href={purpose.primaryHref} className="clarity-purpose-cta">
                    {purpose.primaryLabel} →
                  </Link>
                ) : (
                  <a href={purpose.primaryHref} className="clarity-purpose-cta">
                    {purpose.primaryLabel} →
                  </a>
                )}
              </>
            ) : null}
          </span>
        </p>
      ) : null}
      {purpose.consequence ? (
        <p className="clarity-purpose-row clarity-purpose-consequence">
          <span className="clarity-purpose-label">If you do</span>
          <span>{purpose.consequence}</span>
        </p>
      ) : null}
    </aside>
  );
}

type ClarityEmptyProps = {
  title: string;
  body: string;
  next: string;
  consequence?: string;
  action?: ReactNode;
};

/** Intelligent empty state — explanation + next + optional consequence. */
export function ClarityEmpty({
  title,
  body,
  next,
  consequence,
  action,
}: ClarityEmptyProps) {
  return (
    <div className="clarity-empty font-sans" role="status">
      <p className="clarity-empty-title">{title}</p>
      <p className="clarity-empty-body">{body}</p>
      <p className="clarity-empty-next">
        <span className="clarity-purpose-label">Next</span> {next}
      </p>
      {consequence ? (
        <p className="clarity-empty-consequence">
          <span className="clarity-purpose-label">If you do</span> {consequence}
        </p>
      ) : null}
      {action ? <div className="clarity-empty-action">{action}</div> : null}
    </div>
  );
}

type ClarityFailureProps = {
  title: string;
  cause: string;
  impact: string;
  recovery: string;
  action?: ReactNode;
};

/** Failure with cause, impact, and exact recovery — never a dead end. */
export function ClarityFailure({
  title,
  cause,
  impact,
  recovery,
  action,
}: ClarityFailureProps) {
  return (
    <div className="clarity-failure font-sans" role="alert">
      <p className="clarity-failure-title">{title}</p>
      <p className="clarity-purpose-row">
        <span className="clarity-purpose-label">Cause</span>
        <span>{cause}</span>
      </p>
      <p className="clarity-purpose-row">
        <span className="clarity-purpose-label">Impact</span>
        <span>{impact}</span>
      </p>
      <p className="clarity-purpose-row clarity-purpose-next">
        <span className="clarity-purpose-label">Recover</span>
        <span>{recovery}</span>
      </p>
      {action ? <div className="clarity-failure-action">{action}</div> : null}
    </div>
  );
}

type WorkflowTrailProps = {
  links: WorkflowTrailLink[];
  className?: string;
};

/**
 * One-click trail through the service loop.
 * Only real hrefs are clickable — idle stages stay readable, not fake.
 */
export function WorkflowTrail({ links, className = "" }: WorkflowTrailProps) {
  return (
    <nav
      className={`workflow-trail font-sans ${className}`.trim()}
      aria-label="Record workflow"
    >
      <p className="workflow-trail-kicker">Workflow</p>
      <ol className="workflow-trail-list">
        {links.map((link, index) => (
          <li
            key={link.id}
            className={`workflow-trail-item is-${link.state}`}
          >
            {index > 0 ? (
              <span className="workflow-trail-rail" aria-hidden />
            ) : null}
            {link.href && link.state !== "idle" ? (
              <Link href={link.href} className="workflow-trail-node">
                {link.label}
              </Link>
            ) : (
              <span className="workflow-trail-node">{link.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
