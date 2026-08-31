import type { ReactNode } from "react";

/** Passthrough wrapper — scroll animations removed for a calmer, premium feel. */
export function RevealOnScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return <div className={className}>{children}</div>;
}
