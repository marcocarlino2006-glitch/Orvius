"use client";

import type { ReactNode } from "react";
import { ShellStat } from "@/components/shell-primitives";

type ProRingBannerProps = {
  ring?: number;
  name: string;
  description: string;
  live?: boolean;
};

export function ProRingBanner({ ring, name, description, live }: ProRingBannerProps) {
  const prefix =
    ring != null ? `Ring ${String(ring).padStart(2, "0")} · ${name}` : name;

  return (
    <div className="pro-ring-banner">
      <p className="pro-ring-banner-kicker font-sans">
        {live ? <span className="home-os-live-dot" aria-hidden /> : null}
        {prefix}
        {live ? " · Live" : ""}
      </p>
      <p className="pro-ring-banner-desc font-sans">{description}</p>
    </div>
  );
}

type ProSearchBarProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function ProSearchBar({
  value,
  onChange,
  placeholder = "Search…",
  className = "",
}: ProSearchBarProps) {
  return (
    <div className={`pro-search ${className}`}>
      <svg
        className="pro-search-icon"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 12.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Z"
          stroke="currentColor"
          strokeWidth="1.25"
        />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pro-search-input font-sans"
      />
    </div>
  );
}

type ProStatRowProps = {
  stats: Array<{ label: string; value: string | number; highlight?: boolean }>;
  className?: string;
};

export function ProStatRow({ stats, className = "" }: ProStatRowProps) {
  const gridClass =
    stats.length === 3
      ? "grid-cols-3"
      : stats.length <= 2
        ? "grid-cols-2"
        : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className={`pro-stat-grid grid gap-3 ${gridClass} ${className}`}>
      {stats.map((stat) => (
        <ShellStat
          key={stat.label}
          label={stat.label}
          value={stat.value}
          highlight={stat.highlight}
        />
      ))}
    </div>
  );
}

type ProSectionHeadProps = {
  kicker: string;
  title: string;
  action?: ReactNode;
  className?: string;
};

export function ProSectionHead({ kicker, title, action, className = "" }: ProSectionHeadProps) {
  return (
    <div className={`pro-section-head ${className}`}>
      <div>
        <p className="pro-section-kicker font-sans">{kicker}</p>
        <h3 className="pro-section-title font-serif">{title}</h3>
      </div>
      {action}
    </div>
  );
}
