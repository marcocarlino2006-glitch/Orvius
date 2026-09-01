"use client";

import Link from "next/link";
import { telHref } from "@/lib/demo-line";
import { useBusiness } from "@/lib/use-business";

type ProShopLineCtaProps = {
  label?: string;
  showNumber?: boolean;
  className?: string;
  variant?: "primary" | "secondary";
};

export function ProShopLineCta({
  label = "Call your line",
  showNumber = true,
  className = "",
  variant = "primary",
}: ProShopLineCtaProps) {
  const { business, loading } = useBusiness();
  const line = business?.line;
  const btnClass =
    variant === "primary" ? "btn btn-void text-sm" : "btn btn-secondary text-sm";

  if (loading && !line) {
    return (
      <span className={`${btnClass} opacity-60 ${className}`} aria-hidden>
        Loading…
      </span>
    );
  }

  if (!line) {
    return (
      <Link href="/dashboard/settings" className={`${btnClass} ${className}`}>
        Set up your line
      </Link>
    );
  }

  return (
    <a href={telHref(line)} className={`${btnClass} ${className}`}>
      {label}
      {showNumber ? ` · ${line}` : ""}
    </a>
  );
}
