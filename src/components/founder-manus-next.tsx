"use client";

import {
  MANUS_POST_STEPS,
  type ManusPostStep,
} from "@/lib/manus-post";

type FounderManusNextProps = {
  /** Live next step from /api/admin/mastery when available. */
  next?: ManusPostStep | null;
  /** Compact for Settings; roomier for /admin/daily. */
  tone?: "quiet" | "cockpit";
};

/**
 * Quiet founder-only Manus next gate.
 * Not a second go-live cockpit — one next step + CLI pointer.
 */
export function FounderManusNext({
  next,
  tone = "quiet",
}: FounderManusNextProps) {
  const step = next ?? MANUS_POST_STEPS[0];
  const isCockpit = tone === "cockpit";

  return (
    <div
      className={
        isCockpit
          ? "mb-4 rounded-md border border-flare/40 bg-flare/5 p-3"
          : "pro-settings-secondary-body"
      }
    >
      <p
        className={
          isCockpit
            ? "font-sans text-xs uppercase tracking-wide text-flare"
            : "account-settings-hint font-sans mb-2"
        }
      >
        {isCockpit ? "Manus post · next" : "Single next Manus gate — do not skip."}
      </p>
      <p
        className={
          isCockpit
            ? "mt-1 font-sans text-sm font-semibold text-void"
            : "font-sans text-sm font-semibold text-void"
        }
      >
        {step.order}. {step.title}
      </p>
      <p className="mt-1 font-sans text-sm text-ash">{step.action}</p>
      {step.command ? (
        <p className="mt-2 font-sans text-xs text-ash">
          CLI: <code className="text-void">{step.command}</code>
        </p>
      ) : null}
      <p className="mt-2 font-sans text-xs text-ash">
        Full sequence: <code className="text-void">npm run manus:post</code>
      </p>
    </div>
  );
}
