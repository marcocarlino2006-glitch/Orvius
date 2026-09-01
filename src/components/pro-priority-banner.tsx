"use client";

import Link from "next/link";

type ProPriorityBannerProps = {
  count: number;
  noun?: string;
  href: string;
  actionLabel: string;
  detail?: string;
};

export function ProPriorityBanner({
  count,
  noun = "lead",
  href,
  actionLabel,
  detail,
}: ProPriorityBannerProps) {
  if (count <= 0) return null;

  return (
    <div className="pro-priority-banner" role="status">
      <div className="pro-priority-banner-copy font-sans">
        <p className="pro-priority-banner-title">
          {count} new {noun}
          {count === 1 ? "" : "s"} waiting
        </p>
        {detail ? <p className="pro-priority-banner-detail">{detail}</p> : null}
      </div>
      <Link href={href} className="btn btn-void text-sm pro-priority-banner-cta">
        {actionLabel}
      </Link>
    </div>
  );
}
