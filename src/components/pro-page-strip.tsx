"use client";

import Link from "next/link";
import { telHref } from "@/lib/demo-line";
import { useBusiness } from "@/lib/use-business";

type ProPageStripProps = {
  /** Show follow-up count pill when leads need attention */
  followUpCount?: number;
};

export function ProPageStrip({ followUpCount = 0 }: ProPageStripProps) {
  const { business } = useBusiness();
  const line = business?.line;

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
            <Link href="/dashboard/settings" className="pro-page-strip-link">
              Set up in Settings →
            </Link>
          </>
        )}
      </div>

      <div className="pro-page-strip-actions font-sans">
        {followUpCount > 0 ? (
          <Link href="/dashboard/inbox" className="pro-page-strip-pill">
            {followUpCount} need follow-up
          </Link>
        ) : null}
        {line ? (
          <a href={telHref(line)} className="btn btn-secondary text-sm">
            Test call
          </a>
        ) : (
          <Link href="/dashboard/settings" className="btn btn-secondary text-sm">
            Settings
          </Link>
        )}
      </div>
    </div>
  );
}
