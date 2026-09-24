import type { ReactNode } from "react";

export type StatusTone = "live" | "good" | "attention" | "risk" | "neutral" | "muted";

export function StatusDot({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={`sd sd--${tone}`}>
      <span className="sd-dot" aria-hidden />
      {children}
    </span>
  );
}
