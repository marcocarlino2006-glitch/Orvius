"use client";

import Link from "next/link";
import { OsIcon, type OsIconName } from "@/components/os-icons";

export type OsTab = {
  href: string;
  label: string;
  icon: OsIconName;
  active: boolean;
  badge?: string;
};

/** Phone and tablet only: the daily screens under the thumb, everything else behind More. */
export function OsTabBar({
  tabs,
  moreOpen,
  onMore,
}: {
  tabs: OsTab[];
  moreOpen: boolean;
  onMore: () => void;
}) {
  const underMore = !tabs.some((tab) => tab.active);
  return (
    <nav className="os-tabbar font-sans" aria-label="Main">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`os-tab${tab.active && !moreOpen ? " is-active" : ""}`}
          aria-current={tab.active ? "page" : undefined}
        >
          <span className="os-tab-icon">
            <OsIcon name={tab.icon} />
            {tab.badge ? <span className="os-tab-badge">{tab.badge}</span> : null}
          </span>
          <span className="os-tab-label">{tab.label}</span>
        </Link>
      ))}
      <button
        type="button"
        className={`os-tab${moreOpen || underMore ? " is-active" : ""}`}
        onClick={onMore}
        aria-expanded={moreOpen}
      >
        <span className="os-tab-icon">
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </span>
        <span className="os-tab-label">More</span>
      </button>
    </nav>
  );
}

export function OsMobileNavBackdrop({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <button
      type="button"
      className="os-mobile-nav-backdrop"
      onClick={onClose}
      aria-label="Close menu"
    />
  );
}
