"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type ConfirmState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ok";
      already: boolean;
      businessName: string;
      title: string;
      scheduledAt: string | null;
    };

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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6 py-16 font-sans">
      {state.status === "loading" ? (
        <p className="text-ash">Confirming your appointment…</p>
      ) : null}

      {state.status === "error" ? (
        <>
          <h1 className="text-2xl font-semibold text-void">Link not valid</h1>
          <p className="text-ash">{state.message}</p>
        </>
      ) : null}

      {state.status === "ok" ? (
        <>
          <p className="text-xs uppercase tracking-[0.14em] text-ash">
            {state.businessName}
          </p>
          <h1 className="text-2xl font-semibold text-void">
            {state.already ? "Already confirmed" : "You're confirmed"}
          </h1>
          <p className="text-ash">
            {state.title}
            {state.scheduledAt
              ? ` · ${new Date(state.scheduledAt).toLocaleString()}`
              : null}
          </p>
          <p className="text-sm text-ash">
            The shop has your confirmation. Keep this number handy if plans change.
          </p>
        </>
      ) : null}
    </main>
  );
}
