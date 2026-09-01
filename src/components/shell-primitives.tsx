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
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="pro-panel">
      <div className="pro-panel-head">
        <h2 className="pro-panel-title font-sans">{title}</h2>
        {action}
      </div>
      <div className="pro-panel-body">{children}</div>
    </section>
  );
}

export function ShellStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  const active = highlight || (value !== "—" && value !== 0);

  return (
    <div className={`pro-stat ${active ? "pro-stat-live" : ""}`}>
      <p className="pro-stat-label font-sans">{label}</p>
      <p className="pro-stat-value font-sans">{value}</p>
    </div>
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
