"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DEMO_LINE_DISPLAY, demoLineHref, telHref } from "@/lib/demo-line";

type Ring1LiveStripProps = {
  showInboxLink?: boolean;
};

export function Ring1LiveStrip({ showInboxLink = true }: Ring1LiveStripProps) {
  const [line, setLine] = useState(DEMO_LINE_DISPLAY);
  const [lineHref, setLineHref] = useState(demoLineHref());
  const [newLeads, setNewLeads] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/ring1")
      .then((res) => res.json())
      .then((data) => {
        if (data.business?.line) {
          setLine(data.business.line);
          setLineHref(telHref(data.business.line));
        }
        setNewLeads(data.metrics?.newLeads ?? 0);
      })
      .catch(() => null);
  }, []);

  return (
    <div className="ring1-live-strip">
      <div className="ring1-live-strip-main">
        <p className="ring1-live-strip-kicker font-sans">
          <span className="pro-live-dot" />
          Live line
        </p>
        <a href={lineHref} className="ring1-live-strip-number font-sans">
          {line}
        </a>
        <p className="ring1-live-strip-hint font-sans">
          Ring 1 · Answer · qualify · alert
        </p>
      </div>
      <div className="ring1-live-strip-actions font-sans">
        {newLeads != null && newLeads > 0 && showInboxLink ? (
          <Link href="/dashboard/inbox" className="ring1-live-strip-badge">
            {newLeads} new lead{newLeads === 1 ? "" : "s"}
          </Link>
        ) : null}
        <a href={lineHref} className="btn btn-void text-sm">
          Test call
        </a>
      </div>
    </div>
  );
}
