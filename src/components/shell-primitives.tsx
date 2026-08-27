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
    <div
      className={`card p-5 md:p-6 ${active ? "stat-accent" : ""}`}
    >
      <p className="font-sans text-[0.6875rem] font-bold tracking-[0.16em] text-ash uppercase">
        {label}
      </p>
      <p className="mt-2 font-sans text-[2rem] font-semibold leading-none tracking-tight text-void">
        {value}
      </p>
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
      ? "bg-live/12 text-live"
      : tone === "flare"
        ? "bg-flare/12 text-flare-dim"
        : "bg-fog text-ash";

  return (
    <span
      className={`inline-flex rounded-[0.35rem] px-2.5 py-1 font-sans text-[0.6875rem] font-bold tracking-[0.06em] uppercase ${toneClass}`}
    >
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
    <li className="rounded-[0.45rem] border border-rule bg-white px-4 py-3.5 transition hover:border-flare/25 hover:shadow-[var(--shadow-soft)]">
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
