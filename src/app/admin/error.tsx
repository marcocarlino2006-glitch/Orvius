"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { captureClientException } from "@/lib/sentry-report";
import { supportEmail, supportMailto, supportPhone } from "@/lib/support";

const phone = supportPhone();

/**
 * A throw on this screen used to replace the whole document, including the
 * launch card where texting approval is filed. This boundary stays inside the
 * admin layout so Try again can bring that card back.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    captureClientException(
      error,
      { surface: "admin", route: pathname },
      { digest: error.digest },
    );
  }, [error, pathname]);

  return (
    <div className="os-shell-night os-error-page font-sans">
      <div className="plan-upgrade-gate">
        <div className="plan-upgrade-gate-inner">
          <p className="plan-upgrade-gate-kicker">Admin</p>
          <h1 className="plan-upgrade-gate-title">This screen failed to load</h1>
          <p className="plan-upgrade-gate-detail os-own-color os-error-lead">
            <b>A broken screen can&apos;t stop your line.</b> Calls are answered
            by a separate system.
          </p>
          <p className="plan-upgrade-gate-detail">
            Try again to get back to the launch card.
          </p>
          <div className="plan-upgrade-gate-actions">
            <button type="button" onClick={reset} className="btn btn-void text-sm">
              Try again
            </button>
            <Link href="/admin" className="btn btn-secondary text-sm">
              Reload admin
            </Link>
            <a
              href={supportMailto({
                subject: "Admin error",
                path: pathname,
                reference: error.digest,
              })}
              className="btn btn-secondary text-sm"
            >
              Email support
            </a>
          </div>
          <p className="os-error-meta">
            {phone ? `Call or text ${phone.display} · ` : ""}
            {supportEmail}
            {error.digest ? ` · reference ${error.digest}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
