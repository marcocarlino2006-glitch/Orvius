"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "@/app/public-field.css";

type ConfirmState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      already: boolean;
      businessName: string;
      businessPhone: string | null;
      timezone: string | null;
      title: string;
      scheduledAt: string | null;
    };

function formatWhen(iso: string, timezone: string | null) {
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Date(iso).toLocaleString("en-US", { ...opts, timeZone: timezone ?? undefined });
  } catch {
    return new Date(iso).toLocaleString("en-US", opts);
  }
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10
    ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
    : raw;
}

export default function CustomerConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<ConfirmState>({ status: "loading" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/public/confirm/${token}`, {
          method: "POST",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: data.error ?? "This confirm link is invalid or expired.",
          });
          return;
        }
        setState({
          status: "ok",
          already: Boolean(data.already),
          businessName: data.job.businessName,
          businessPhone: data.job.businessPhone ?? null,
          timezone: data.job.timezone ?? null,
          title: data.job.title,
          scheduledAt: data.job.scheduledAt,
        });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Could not confirm right now. Try again in a moment.",
          });
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <main className="pf pf--center">
      {state.status === "loading" ? <p className="pf-muted">Confirming your appointment…</p> : null}

      {state.status === "error" ? (
        <header className="pf-head">
          <h1 className="pf-title">Link not valid</h1>
          <p className="pf-sub">{state.message}</p>
        </header>
      ) : null}

      {state.status === "ok" ? (
        <>
          <header className="pf-head">
            <p className="pf-kicker">{state.businessName}</p>
            <span className="pf-pill is-done">{state.already ? "Already confirmed" : "Confirmed"}</span>
            <h1 className="pf-title">
              {state.already ? "You're already confirmed" : "You're confirmed"}
            </h1>
          </header>
          <dl className="pf-card">
            <div className="pf-row">
              <dt>Visit</dt>
              <dd>{state.title}</dd>
            </div>
            {state.scheduledAt ? (
              <div className="pf-row">
                <dt>When</dt>
                <dd>{formatWhen(state.scheduledAt, state.timezone)}</dd>
              </div>
            ) : null}
          </dl>
          {state.businessPhone ? (
            <a className="pf-action" href={`tel:${state.businessPhone}`}>
              <span className="pf-action-label">Call {state.businessName}</span>
              <span className="pf-action-detail">
                {formatPhone(state.businessPhone)} · if plans change
              </span>
            </a>
          ) : (
            <p className="pf-muted">The shop has your confirmation. Reply to their text if plans change.</p>
          )}
        </>
      ) : null}
    </main>
  );
}
