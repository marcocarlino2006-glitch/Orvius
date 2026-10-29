"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { DayOne } from "@/lib/day-one";
import { invalidateAccount } from "@/lib/account-client";
import { parseAvgTicketDollars } from "@/lib/money";

/** The three things a paid shop still owes before the desk is finished. */
export function DayOnePanel({
  day,
  onSaved,
}: {
  day: DayOne;
  onSaved: () => void | Promise<void>;
}) {
  const [dollars, setDollars] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  async function saveTicket(event: FormEvent) {
    event.preventDefault();
    const cents = parseAvgTicketDollars(dollars);
    if (cents == null) {
      setError(
        dollars.trim()
          ? "Average ticket must be between $50 and $50,000."
          : "Enter your average ticket.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      invalidateAccount();
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avgTicketCents: cents }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok)
        throw new Error(body?.error ?? "Could not save the average ticket.");
      setDollars("");
      await onSaved();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save the average ticket.",
      );
    } finally {
      setSaving(false);
    }
  }

  const done = day.steps.filter((step) => step.done).length;
  const next = day.steps.find((step) => !step.done) ?? null;
  const actionLabel = (id: string) =>
    id === "number" ? "Set up your number" : "Open card payments";

  const ticketForm = (
    <form
      className="cmd-day-one-form"
      onSubmit={(event) => void saveTicket(event)}
    >
      <label className="sc-affix" htmlFor="day-one-ticket">
        <span>$</span>
        <input
          id="day-one-ticket"
          inputMode="decimal"
          autoComplete="off"
          placeholder="400"
          aria-label="Average ticket in dollars"
          value={dollars}
          onChange={(event) => setDollars(event.target.value)}
        />
      </label>
      <button
        type="submit"
        className="ox-btn ox-btn--primary ox-btn--sm"
        disabled={saving}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );

  return (
    <section className="cmd-day-one" aria-labelledby="day-one-title">
      <div className="cmd-day-one-head">
        <h2 id="day-one-title" className="cmd-day-one-title">
          Finish day one
        </h2>
        <span className="cmd-day-one-count">
          {done} of {day.steps.length} done
        </span>
        <button
          type="button"
          className="cmd-day-one-toggle"
          aria-expanded={showAll}
          aria-controls={showAll ? "day-one-steps" : undefined}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Hide steps" : "All steps"}
        </button>
      </div>
      <p className="cmd-day-one-worth">{day.worth}</p>
      {!showAll && next ? (
        <div className="cmd-day-one-next">
          <p className="cmd-day-one-step-title">
            <span className="cmd-day-one-next-label">Next</span> {next.title}
          </p>
          {next.href ? (
            <Link href={next.href} className="cmd-issue-action">
              {actionLabel(next.id)} →
            </Link>
          ) : null}
          {next.id === "ticket" ? ticketForm : null}
        </div>
      ) : null}
      {showAll ? (
        <ol id="day-one-steps" className="cmd-day-one-list">
          {day.steps.map((step, index) => (
            <li
              key={step.id}
              className={
                step.done
                  ? "cmd-day-one-step cmd-day-one-step--done"
                  : "cmd-day-one-step"
              }
            >
              <span className="cmd-day-one-mark" aria-hidden>
                {step.done ? (
                  <svg
                    viewBox="0 0 16 16"
                    width="10"
                    height="10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                ) : (
                  index + 1
                )}
              </span>
              <p className="cmd-day-one-step-title">
                <span className="sr-only">
                  {step.done ? "Done: " : `Step ${index + 1}: `}
                </span>
                {step.title}
              </p>
              {step.done ? null : (
                <p className="cmd-day-one-detail">{step.detail}</p>
              )}
              {step.href ? (
                <Link href={step.href} className="cmd-issue-action">
                  {actionLabel(step.id)} →
                </Link>
              ) : null}
              {step.id === "ticket" && !step.done ? ticketForm : null}
            </li>
          ))}
        </ol>
      ) : null}
      {error ? (
        <p className="cmd-day-one-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
