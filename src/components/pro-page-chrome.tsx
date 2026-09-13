"use client";

import type { ReactNode } from "react";

type ProRingBannerProps = {
  ring?: number;
  name: string;
  description: string;
  live?: boolean;
};

export function ProRingBanner({ ring, name, description, live }: ProRingBannerProps) {
  const prefix = ring != null ? `${name}` : name;

  return (
    <div className="pro-ring-banner">
      <p className="pro-ring-banner-kicker font-sans">
        {live ? <span className="pro-live-dot" aria-hidden /> : null}
        {prefix}
        {live ? " · Active" : ""}
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

type ProSectionHeadProps = {
  kicker: string;
  title: string;
  action?: ReactNode;
  className?: string;
  /* The right level depends on what encloses it, so the caller decides. h3
     suits a section nested under a panel heading; a section sitting directly
     under the page title needs h2, or the outline skips a level. */
  level?: 2 | 3;
};

export function ProSectionHead({
  kicker,
  title,
  action,
  className = "",
  level = 3,
}: ProSectionHeadProps) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className={`pro-section-head ${className}`}>
      <div>
        <p className="pro-section-kicker font-sans">{kicker}</p>
        <Heading className="pro-section-title font-sans">{title}</Heading>
      </div>
      {action}
    </div>
  );
}

type ProEmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
  compact?: boolean;
};

export function ProEmptyState({ title, body, action, compact }: ProEmptyStateProps) {
  return (
    <div className={`pro-empty-state font-sans ${compact ? "pro-empty-state-compact" : ""}`}>
      <p className="pro-empty-state-title">{title}</p>
      {body ? <p className="pro-empty-state-text">{body}</p> : null}
      {action ? <div className="pro-empty-state-action">{action}</div> : null}
    </div>
  );
}

type ProListEndProps = {
  /** How many rows are above this line. */
  count: number;
  /** Plural noun for the rows — "call", "lead", "job". */
  noun: string;
  /** Set when the list is filtered, so the line says what it counted. */
  scope?: string;
};

/**
 * The line that closes a list.
 *
 * A list of one row followed by half a screen of nothing does not read as
 * "there is one". It reads as a page that failed to finish loading, and the
 * owner's next move is to refresh rather than to act. Saying how many there
 * are, and that there are no more, is the difference between a quiet screen
 * and a broken one.
 */
export function ProListEnd({ count, noun, scope }: ProListEndProps) {
  const plural = count === 1 ? noun : `${noun}s`;
  return (
    <p className="pro-list-end font-sans" role="status">
      <span className="pro-list-end-rule" aria-hidden="true" />
      <span className="pro-list-end-text">
        {count} {plural}
        {scope ? ` ${scope}` : ""} · nothing older
      </span>
    </p>
  );
}

type ProFilterOption = {
  value: string;
  label: string;
  count?: number;
};

type ProFilterBarProps = {
  options: ProFilterOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function ProFilterBar({
  options,
  value,
  onChange,
  className = "",
}: ProFilterBarProps) {
  return (
    <div className={`pro-filter-bar ${className}`} role="tablist" aria-label="Filter">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            className={`pro-filter-tab font-sans ${active ? "pro-filter-tab-active" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {typeof option.count === "number" ? ` (${option.count})` : ""}
          </button>
        );
      })}
    </div>
  );
}
