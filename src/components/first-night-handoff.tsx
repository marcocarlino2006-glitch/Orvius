"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export const FIRST_NIGHT_PARAM = "live";
export const FIRST_NIGHT_STORAGE_KEY = "orvius-first-night-pending";

/**
 * Close the onboarding → Command cliff.
 * One screen, one job, then the normal pulse takes over.
 */
export function FirstNightHandoff() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get(FIRST_NIGHT_PARAM) === "1";
    let pending = false;
    try {
      pending = sessionStorage.getItem(FIRST_NIGHT_STORAGE_KEY) === "1";
    } catch {
      /* private mode */
    }
    setOpen(fromQuery || pending);
  }, [searchParams]);

  function enterCommand() {
    try {
      sessionStorage.removeItem(FIRST_NIGHT_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setOpen(false);
    router.replace("/dashboard#attention-board");
  }

  if (!open) return null;

  return (
    <aside
      className="first-night-handoff font-sans"
      role="dialog"
      aria-label="You’re live — first night"
    >
      <p className="first-night-handoff-kicker">You’re live</p>
      <h2 className="first-night-handoff-title">Tonight has one job.</h2>
      <p className="first-night-handoff-detail">
        When a call lands, clear the board. The banner at the top of Command is
        always your next move.
      </p>
      <div className="first-night-handoff-actions">
        <button
          type="button"
          className="btn btn-void text-sm"
          onClick={enterCommand}
        >
          Open the board
        </button>
      </div>
    </aside>
  );
}

/** Call before leaving onboarding so Command shows the handoff once. */
export function markFirstNightPending() {
  try {
    sessionStorage.setItem(FIRST_NIGHT_STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}
