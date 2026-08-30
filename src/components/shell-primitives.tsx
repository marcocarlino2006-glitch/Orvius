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
    <section className="card-elevated p-6 md:p-7">
      <div className="mb-5 flex items-start justify-between gap-4 border-b border-rule pb-4">
        <h2 className="font-sans text-[0.9375rem] font-semibold tracking-tight text-void">
          {title}
        </h2>
        {action}
      </div>
      {children}
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
    <div className={`os-stat ${active ? "os-stat-live" : ""}`}>
      <p className="os-stat-label font-sans">{label}</p>
      <p className="os-stat-value font-sans">{value}</p>
    </div>
  );
}

export function ShellBadge({
  tone,
  children,
}: {
  tone: "live" | "flare" | "neutral";
  children: ReactNode;
}) {
  const toneClass =
    tone === "live"
      ? "home-os-pill home-os-pill-live"
      : tone === "flare"
        ? "home-os-pill home-os-pill-flare"
        : "home-os-pill";

  return (
    <span className={toneClass}>
      {children}
    </span>
  );
}

export function ShellEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-rule bg-fog/50 px-4 py-8 text-center font-sans text-sm leading-relaxed text-ash">
      {children}
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
  const toneClass =
    tone === "error"
      ? "border-flare/25 bg-flare/8 text-flare-dim"
      : "border-live/25 bg-live/8 text-live";

  return (
    <div className={`rounded-[0.45rem] border px-4 py-3 font-sans text-sm ${toneClass}`}>
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
    <li className="rounded-[0.45rem] border border-rule bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-sans text-sm font-semibold text-void">{title}</p>
        {meta ? (
          <span className="shrink-0 font-sans text-[0.6875rem] font-medium tracking-wide text-ash uppercase">
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </li>
  );
}
