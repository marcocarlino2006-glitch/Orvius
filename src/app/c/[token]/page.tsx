"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

type JobView = {
  businessName: string;
  title: string;
  scheduledAt: string | null;
};

type ConfirmState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "choice"; job: JobView }
  | {
      status: "done";
      action: "confirm" | "decline" | "reschedule_request";
      already: boolean;
      job: JobView;
    };

function formatWhen(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function CustomerConfirmPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<ConfirmState>({ status: "loading" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/public/confirm/${token}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message: data.error ?? "This confirm link is invalid or expired.",
          });
          return;
        }

        const job: JobView = {
          businessName: data.job.businessName,
          title: data.job.title,
          scheduledAt: data.job.scheduledAt,
        };

        if (data.state === "confirmed") {
          setState({
            status: "done",
            action: "confirm",
            already: true,
            job,
          });
          return;
        }
        if (data.state === "declined") {
          setState({
            status: "done",
            action: "decline",
            already: true,
            job,
          });
          return;
        }
        if (data.state === "reschedule_requested") {
          setState({
            status: "done",
            action: "reschedule_request",
            already: true,
            job,
          });
          return;
        }

        setState({ status: "choice", job });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Could not load this link. Try again in a moment.",
          });
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const act = useCallback(
    async (action: "confirm" | "decline" | "reschedule_request") => {
      if (!token || busy) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/public/confirm/${token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok) {
          setState({
            status: "error",
            message: data.error ?? "Could not update this appointment.",
          });
          return;
        }
        setState({
          status: "done",
          action: data.action,
          already: Boolean(data.already),
          job: {
            businessName: data.job.businessName,
            title: data.job.title,
            scheduledAt: data.job.scheduledAt,
          },
        });
      } catch {
        setState({
          status: "error",
          message: "Could not update right now. Try again in a moment.",
        });
      } finally {
        setBusy(false);
      }
    },
    [token, busy],
  );

  const when =
    state.status === "choice" || state.status === "done"
      ? formatWhen(state.job.scheduledAt)
      : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-16 font-sans text-[color:var(--ui-text,#f4f1ea)]">
      {state.status === "loading" ? (
        <p className="text-[color:var(--ui-muted,#9a958c)]">
          Loading your appointment…
        </p>
      ) : null}

      {state.status === "error" ? (
        <>
          <h1 className="text-2xl font-semibold">Link not valid</h1>
          <p className="text-[color:var(--ui-muted,#9a958c)]">{state.message}</p>
        </>
      ) : null}

      {state.status === "choice" ? (
        <>
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ui-muted,#9a958c)]">
            {state.job.businessName}
          </p>
          <h1 className="text-2xl font-semibold">Confirm your service window?</h1>
          <p className="text-[color:var(--ui-muted,#9a958c)]">
            {state.job.title}
            {when ? ` · ${when}` : null}
          </p>
          <p className="text-sm text-[color:var(--ui-muted,#9a958c)]">
            This is a proposed window — not locked until you confirm.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="rounded-md bg-[color:var(--ui-text,#f4f1ea)] px-4 py-2.5 text-sm font-medium text-[color:var(--ui-bg,#12110f)] disabled:opacity-50"
              disabled={busy}
              onClick={() => void act("confirm")}
            >
              Confirm
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--ui-border,#3a3832)] px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => void act("reschedule_request")}
            >
              Need a different time
            </button>
            <button
              type="button"
              className="rounded-md border border-[color:var(--ui-border,#3a3832)] px-4 py-2.5 text-sm font-medium disabled:opacity-50"
              disabled={busy}
              onClick={() => void act("decline")}
            >
              Decline
            </button>
          </div>
        </>
      ) : null}

      {state.status === "done" && state.action === "confirm" ? (
        <>
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ui-muted,#9a958c)]">
            {state.job.businessName}
          </p>
          <h1 className="text-2xl font-semibold">
            {state.already ? "Already confirmed" : "You're confirmed"}
          </h1>
          <p className="text-[color:var(--ui-muted,#9a958c)]">
            {state.job.title}
            {when ? ` · ${when}` : null}
          </p>
          <p className="text-sm text-[color:var(--ui-muted,#9a958c)]">
            The shop has your confirmation. Keep this number handy if plans
            change.
          </p>
        </>
      ) : null}

      {state.status === "done" && state.action === "decline" ? (
        <>
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ui-muted,#9a958c)]">
            {state.job.businessName}
          </p>
          <h1 className="text-2xl font-semibold">
            {state.already ? "Already declined" : "Window declined"}
          </h1>
          <p className="text-[color:var(--ui-muted,#9a958c)]">
            {state.job.title}
            {when ? ` · ${when}` : null}
          </p>
          <p className="text-sm text-[color:var(--ui-muted,#9a958c)]">
            We told the shop. Call them if you still need service.
          </p>
        </>
      ) : null}

      {state.status === "done" && state.action === "reschedule_request" ? (
        <>
          <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--ui-muted,#9a958c)]">
            {state.job.businessName}
          </p>
          <h1 className="text-2xl font-semibold">
            {state.already ? "Reschedule already requested" : "Shop will call you"}
          </h1>
          <p className="text-[color:var(--ui-muted,#9a958c)]">
            {state.job.title}
            {when ? ` · was ${when}` : null}
          </p>
          <p className="text-sm text-[color:var(--ui-muted,#9a958c)]">
            No new window was locked. The shop will call to pick a time that
            works.
          </p>
        </>
      ) : null}
    </main>
  );
}
