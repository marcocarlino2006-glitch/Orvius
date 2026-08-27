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
    <section className="card p-6 md:p-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <h2 className="font-sans text-base font-semibold tracking-tight text-void">
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
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-5 md:p-6">
      <p className="font-sans text-xs font-medium tracking-[0.12em] text-ash uppercase">
        {label}
      </p>
      <p className="mt-2 font-sans text-3xl font-semibold tracking-tight text-void">
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
      className={`inline-flex rounded-md px-2.5 py-1 font-sans text-xs font-semibold ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function ShellEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="font-sans text-sm leading-relaxed text-ash">{children}</p>
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
    <div className={`rounded-md border px-4 py-3 font-sans text-sm ${toneClass}`}>
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
    <li className="rounded-md border border-rule bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-sans text-sm font-medium text-void">{title}</p>
        {meta ? (
          <span className="shrink-0 font-sans text-xs text-ash">{meta}</span>
        ) : null}
      </div>
      {children}
    </li>
  );
}
