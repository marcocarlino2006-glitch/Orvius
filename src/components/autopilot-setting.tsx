"use client";

import { useState } from "react";
import { invalidateAccount } from "@/lib/account-client";

/** Saves on its own; it sits inside the Settings form, so it must not be a form or submit it. */
export function AutopilotSetting({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setBusy(true);
    setError(null);
    setOn(next);
    try {
      invalidateAccount();
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autopilot: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setOn(!next);
      setError("That did not save. Nothing changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="autopilot-setting">
      <label className="autopilot-row">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
        <span>
          <b>Let Orvius handle routine work</b>
          <span className="account-settings-hint">
            Texts customers to confirm upcoming appointments and assigns a job when one technician is clearly the right
            fit. Ties, emergencies, safety calls, and anything in the next two hours still come to you. Every action is
            in the timeline.
          </span>
        </span>
      </label>
      {error ? (
        <p className="dw-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
