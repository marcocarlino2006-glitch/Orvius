import type { ReactNode } from "react";

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="label mb-2 block">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}

export function ShellPanel({
  title,
  children,
  action,
  dense = false,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  dense?: boolean;
}) {
  return (
    <section className={`pro-panel${dense ? " pro-panel--dense" : ""}`}>
      <div className="pro-panel-head">
        <h2 className="pro-panel-title font-sans">{title}</h2>
        {action}
      </div>
      <div className="pro-panel-body">{children}</div>
    </section>
  );
}

export function ShellBadge({
  tone,
  children,
}: {
  tone: "live" | "flare" | "neutral" | "muted";
  children: ReactNode;
}) {
  return (
    <span className={`status-pill status-pill-${tone}`}>
      {children}
    </span>
  );
}

export function ShellEmpty({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="pro-empty-state font-sans">
      <p className="pro-empty-state-text">{children}</p>
      {action ? <div className="pro-empty-state-action">{action}</div> : null}
    </div>
  );
}

/**
 * The "still fetching" state, with the marker that says so.
 *
 * This existed eight times as a bare <p>Loading…</p>. It read correctly to a
 * person and was invisible to everything else: aria-busy was missing, so a
 * screen reader got a paragraph rather than a busy region, and every audit in
 * scripts/ waits on `[aria-busy], [class*="-loading"], [class*="skeleton"]`
 * before measuring — so a route that used this state was measured *while
 * loading*. That is how the surface audit came to report the job detail page
 * as 89% empty with one font size on it: it was looking at this word.
 */
export function ShellLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="pro-loading-text font-sans" aria-busy="true">
      {label}
    </p>
  );
}

export function ShellAlert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: ReactNode;
}) {
  return (
    <div className={`pro-alert pro-alert-${tone} font-sans`}>
      {children}
    </div>
  );
}

export function ShellListItem({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <li className="pro-list-item">
      <div className="pro-list-item-head">
        <p className="pro-list-item-title font-sans">{title}</p>
        {meta ? <span className="pro-list-item-meta font-sans">{meta}</span> : null}
      </div>
      {children}
    </li>
  );
}
