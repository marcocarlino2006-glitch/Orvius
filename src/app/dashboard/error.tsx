"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { supportEmail, supportMailto } from "@/lib/support";

/*
  What a shop owner saw when the dashboard threw: the default Next.js error
  screen. No branding, no way out, and at 3am no indication whether the thing
  they actually pay for had stopped working too.

  That last part is the reason this page leads with the phone line. Voice never
  touches this app — the number is imported into Vapi and Orvius only reads the
  webhooks afterwards — so a dashboard that has fallen over is still a shop
  whose calls are being answered. Left unsaid, the owner's reasonable
  assumption is the opposite, and the support mail we get is a panic instead of
  a bug report.

  Deliberately self-contained: no OsShell, no fetch, no context. An error
  boundary that renders the same tree that just threw is an error boundary that
  throws, and the owner gets the white screen anyway.
*/
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    /*
      Client-side, so this is the only record that the owner hit this at all —
      the server never saw a render it could log.
    */
    console.error("dashboard.render_error", {
      digest: error.digest,
      message: error.message,
      pathname,
    });
  }, [error, pathname]);

  return (
    <div className="os-shell-night os-error-page font-sans">
      <div className="plan-upgrade-gate">
        <div className="plan-upgrade-gate-inner">
          <p className="plan-upgrade-gate-kicker">Dashboard</p>
          <h1 className="plan-upgrade-gate-title">This screen failed to load</h1>
          {/*
            os-own-color because the night shell paints every <p> one muted
            grey by default, and this is the sentence that decides whether the
            owner goes back to sleep or starts calling customers themselves.
          */}
          <p className="plan-upgrade-gate-detail os-own-color os-error-lead">
            <b>Your shop line is unaffected.</b> Calls are still being answered
            and your alerts are still being sent — this is the dashboard only.
          </p>
          <p className="plan-upgrade-gate-detail">
            Try again, and if it keeps failing send us this screen and we will
            look at it.
          </p>

          <div className="plan-upgrade-gate-actions">
            <button type="button" onClick={reset} className="btn btn-void text-sm">
              Try again
            </button>
            <Link href="/dashboard" className="btn btn-secondary text-sm">
              Back to command
            </Link>
            <a
              href={supportMailto({
                subject: "Dashboard error",
                path: pathname,
                reference: error.digest,
              })}
              className="btn btn-secondary text-sm"
            >
              Email support
            </a>
          </div>

          {/*
            The digest is the only thing that joins this owner's report to a
            line in our logs, so it is on the page rather than in the mailto
            alone — people screenshot errors, they do not always click.
          */}
          <p className="os-error-meta">
            {supportEmail}
            {error.digest ? ` · reference ${error.digest}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
