"use client";

import { useEffect, useState, type ReactNode } from "react";

export function ScGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="sc-group">
      {title ? <h3 className="sc-group-title">{title}</h3> : null}
      <div className="sc-rows">{children}</div>
    </section>
  );
}

export function ScRow({
  label,
  hint,
  children,
  stack = false,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  stack?: boolean;
  id?: string;
}) {
  return (
    <div id={id} className={`sc-row${stack ? " sc-row--stack" : ""}`}>
      <div className="sc-row-copy">
        <p className="sc-row-label">{label}</p>
        {hint ? <p className="sc-row-hint">{hint}</p> : null}
      </div>
      {children ? <div className="sc-row-control">{children}</div> : null}
    </div>
  );
}

export function ScSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`sc-switch${checked ? " is-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="sc-switch-knob" />
    </button>
  );
}

export function ScStatus({ on, children }: { on: boolean; children: ReactNode }) {
  return <span className={`sc-pill${on ? " is-on" : ""}`}>{children}</span>;
}

/**
 * A text field that saves when you leave it. Keeps its own draft so typing
 * never waits on the network; `onCommit` returns false to keep the draft.
 */
export function ScField({
  value,
  onCommit,
  multiline = false,
  rows = 3,
  type = "text",
  placeholder,
  inputMode,
  autoComplete,
  ariaLabel,
  narrow = false,
}: {
  value: string;
  onCommit: (next: string) => Promise<boolean> | boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  ariaLabel: string;
  narrow?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  async function commit() {
    if (draft !== value) await onCommit(draft);
  }

  const common = {
    className: `sc-input${narrow ? " sc-input--narrow" : ""}`,
    value: draft,
    placeholder,
    "aria-label": ariaLabel,
    onBlur: () => void commit(),
  };

  if (multiline) {
    return (
      <textarea
        {...common}
        rows={rows}
        onChange={(e) => setDraft(e.target.value)}
      />
    );
  }
  return (
    <input
      {...common}
      type={type}
      inputMode={inputMode}
      autoComplete={autoComplete}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
