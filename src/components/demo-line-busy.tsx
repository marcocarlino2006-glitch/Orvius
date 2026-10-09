"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Shown beside the demo number only while the demo line is turning callers away. */
export function DemoLineBusy({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/demo-line")
      .then((res) => (res.ok ? res.json() : { busy: false }))
      .then((data: { busy?: boolean }) => live && setBusy(Boolean(data.busy)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!busy) return null;
  return (
    <p className={["demo-line-busy font-sans", className].filter(Boolean).join(" ")} role="status">
      The demo line is full right now. <Link href="/watch">Watch a real call instead</Link>, or try again in a few minutes.
    </p>
  );
}
