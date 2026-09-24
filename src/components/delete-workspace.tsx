"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

export function DeleteWorkspace({ workspaceName }: { workspaceName: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirm.trim().toLowerCase() === workspaceName.trim().toLowerCase();

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Could not delete the workspace.");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? `${err.message} Nothing was deleted.` : "Could not delete the workspace.");
      setBusy(false);
    }
  }

  return (
    // Rendered inside the Settings form, so this cannot be a <form> of its own.
    <div className="dw-form" role="group" aria-label="Delete workspace">
      <p className="account-settings-hint font-sans">
        Deletes every call, lead, customer, job, and money record in this workspace. Export first if you want a copy. This
        cannot be undone.
      </p>
      <label className="dw-label">
        <span>Type “{workspaceName}” to confirm</span>
        <input
          className="input"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void remove();
          }}
          autoComplete="off"
        />
      </label>
      {error ? (
        <p className="dw-error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className="btn btn-secondary text-sm dw-btn" disabled={!matches || busy} onClick={() => void remove()}>
        {busy ? "Deleting…" : "Delete workspace"}
      </button>
    </div>
  );
}
