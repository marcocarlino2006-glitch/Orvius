"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createRoot } from "react-dom/client";

export type AskChoice = { value: string; label: string; hint?: string };

export type AskOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AskTextOptions = AskOptions & {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  readOnly?: boolean;
  inputMode?: "text" | "decimal";
};

export type AskChoiceOptions = AskOptions & { label: string; choices: AskChoice[]; defaultValue?: string };

type Spec =
  | ({ kind: "confirm" } & AskOptions)
  | ({ kind: "text" } & AskTextOptions)
  | ({ kind: "choice" } & AskChoiceOptions);

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function AskDialog({ spec, done }: { spec: Spec; done: (answer: string | boolean | null) => void }) {
  const titleId = useId();
  const bodyId = useId();
  const fieldId = useId();
  const card = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [text, setText] = useState(spec.kind === "text" ? spec.defaultValue ?? "" : "");
  const [choice, setChoice] = useState(spec.kind === "choice" ? spec.defaultValue ?? "" : "");

  useEffect(() => {
    const first = field.current ?? card.current?.querySelector<HTMLElement>("[data-ask-primary]");
    first?.focus();
    if (spec.kind === "text" && spec.readOnly) field.current?.select();
  }, [spec]);

  const cancel = () => done(spec.kind === "confirm" ? false : null);
  const blocked =
    (spec.kind === "text" && spec.required && !spec.readOnly && !text.trim()) || (spec.kind === "choice" && !choice);
  const accept = () => {
    if (blocked) return;
    if (spec.kind === "confirm") done(true);
    else if (spec.kind === "text") done(spec.readOnly ? null : text);
    else done(choice);
  };

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && !(event.target instanceof HTMLTextAreaElement) && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      accept();
      return;
    }
    if (event.key !== "Tab" || !card.current) return;
    const items = [...card.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onChoiceKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (spec.kind !== "choice") return;
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + spec.choices.length) % spec.choices.length;
    setChoice(spec.choices[next].value);
    card.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  }

  const confirmLabel = spec.confirmLabel ?? (spec.kind === "text" && spec.readOnly ? "Done" : "OK");
  return (
    <div className="ask-dialog" onKeyDown={onKeyDown}>
      <button type="button" className="ask-dialog__backdrop" aria-label={spec.cancelLabel ?? "Cancel"} tabIndex={-1} onClick={cancel} />
      <div
        ref={card}
        className="ask-dialog__card"
        role={spec.kind === "confirm" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={spec.body ? bodyId : undefined}
      >
        <h2 id={titleId} className="ask-dialog__title">{spec.title}</h2>
        {spec.body ? <p id={bodyId} className="ask-dialog__body">{spec.body}</p> : null}
        {spec.kind === "text" ? (
          <div className="ask-dialog__field">
            <label htmlFor={fieldId} className="ask-dialog__label">{spec.label}</label>
            {spec.multiline ? (
              <textarea
                ref={field}
                id={fieldId}
                className="ask-dialog__input"
                rows={3}
                value={text}
                placeholder={spec.placeholder}
                readOnly={spec.readOnly}
                aria-required={spec.required || undefined}
                onChange={(e) => setText(e.target.value)}
              />
            ) : (
              <input
                ref={field}
                id={fieldId}
                className="ask-dialog__input"
                value={text}
                placeholder={spec.placeholder}
                readOnly={spec.readOnly}
                inputMode={spec.inputMode}
                aria-required={spec.required || undefined}
                onChange={(e) => setText(e.target.value)}
              />
            )}
          </div>
        ) : null}
        {spec.kind === "choice" ? (
          <div className="ask-dialog__choices" role="radiogroup" aria-label={spec.label}>
            {spec.choices.map((c, i) => {
              const on = choice === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on || (!choice && i === 0) ? 0 : -1}
                  className={`ask-dialog__choice${on ? " is-on" : ""}`}
                  onClick={() => setChoice(c.value)}
                  onKeyDown={(e) => onChoiceKey(e, i)}
                >
                  <span>{c.label}</span>
                  {c.hint ? <span className="ask-dialog__hint">{c.hint}</span> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="ask-dialog__actions">
          {spec.kind === "text" && spec.readOnly ? null : (
            <button type="button" className="ask-dialog__btn" onClick={cancel}>{spec.cancelLabel ?? "Cancel"}</button>
          )}
          <button
            type="button"
            data-ask-primary
            className={`ask-dialog__btn ask-dialog__btn--primary${spec.danger ? " ask-dialog__btn--danger" : ""}`}
            disabled={blocked}
            onClick={accept}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function open(spec: Spec): Promise<string | boolean | null> {
  if (typeof document === "undefined") return Promise.resolve(spec.kind === "confirm" ? false : null);
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const host = document.createElement("div");
  host.setAttribute("data-ask-dialog", "");
  document.body.appendChild(host);
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  const root = createRoot(host);
  return new Promise((resolve) => {
    const done = (answer: string | boolean | null) => {
      root.unmount();
      host.remove();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
      resolve(answer);
    };
    root.render(<AskDialog spec={spec} done={done} />);
  });
}

/** Yes or no, in the app's own dialog. Cancel, Escape and the backdrop all answer no. */
export async function askConfirm(options: AskOptions): Promise<boolean> {
  return (await open({ kind: "confirm", ...options })) === true;
}

/** A typed answer, or null when they back out. Read-only shows a value to copy and always resolves null. */
export async function askText(options: AskTextOptions): Promise<string | null> {
  const answer = await open({ kind: "text", ...options });
  return typeof answer === "string" ? answer : null;
}

/** One of the listed choices, or null when they back out. */
export async function askChoice(options: AskChoiceOptions): Promise<string | null> {
  const answer = await open({ kind: "choice", ...options });
  return typeof answer === "string" ? answer : null;
}
