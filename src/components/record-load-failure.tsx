"use client";

import Link from "next/link";
import { ShellAlert } from "@/components/shell-primitives";
import type { DashboardLoadFailure } from "@/lib/dashboard-fetch";

export function RecordLoadFailure({
  failure,
  backHref,
  backLabel,
  onRetry,
}: {
  failure: DashboardLoadFailure & { retry: boolean };
  backHref: string;
  backLabel: string;
  onRetry: () => void;
}) {
  return (
    <div className="font-sans">
      <ShellAlert tone="error">
        <strong>{failure.title}.</strong> {failure.cause} {failure.impact} {failure.recovery}
      </ShellAlert>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {failure.retry ? (
          <button type="button" className="ox-btn ox-btn--sm" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        {failure.href ? (
          <Link href={failure.href} className="ox-btn ox-btn--quiet ox-btn--sm">
            {failure.hrefLabel}
          </Link>
        ) : null}
        <Link href={backHref} className="customer-timeline-link">
          ← {backLabel}
        </Link>
      </div>
    </div>
  );
}
