"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { telHref } from "@/lib/demo-line";
import { useBusiness } from "@/lib/use-business";

type ProPageStripProps = {
  /** Show follow-up count pill when leads need attention */
  followUpCount?: number;
  /** Prefer this when the parent already loaded the shop line (e.g. Settings). */
  line?: string | null;
};

export function ProPageStrip({ followUpCount = 0, line: lineProp }: ProPageStripProps) {
  const pathname = usePathname();
  const { business } = useBusiness();
  const line = lineProp !== undefined ? lineProp : business?.line;
  const onSettings = pathname?.startsWith("/dashboard/settings") ?? false;

  return (
    <div className="pro-page-strip" role="region" aria-label="Shop line">
      <div className="pro-page-strip-main font-sans">
        <span className="pro-live-dot" aria-hidden />
        {line ? (
          <>
            <a href={telHref(line)} className="pro-page-strip-line">
              {line}
            </a>
            <span className="pro-page-strip-meta">Your shop line</span>
          </>
        ) : (
          <>
            <span className="pro-page-strip-empty">Line not configured</span>
            {onSettings ? (
              <span className="pro-page-strip-meta">Set it up below</span>
            ) : (
              <Link href="/dashboard/settings" className="pro-page-strip-link">
                Set up in Settings →
              </Link>
            )}
          </>
        )}
      </div>

      <div className="pro-page-strip-actions font-sans">
        {followUpCount > 0 ? (
          <Link href="/dashboard/inbox" className="pro-page-strip-badge">
            {followUpCount} need follow-up
          </Link>
        ) : null}
        {line ? (
          <a href={telHref(line)} className="btn btn-secondary text-sm">
            Test call
          </a>
        ) : onSettings ? null : (
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Settings
          </Link>
        )}
      </div>
    </div>
  );
}
