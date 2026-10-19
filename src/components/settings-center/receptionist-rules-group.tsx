"use client";

import { useEffect, useState } from "react";
import type { ReceptionistApply as Apply } from "@/lib/assistant-apply";
import { CHECKING, runCheckedWrite } from "@/lib/checked-write";
import { sendWrite } from "@/lib/client-write";
import type { ReceptionistRule } from "@/lib/receptionist-rules";
import { ScGroup, ScRow } from "./settings-primitives";

/** The corrections the owner made from call pages; removing one takes it off the next call. */
export function ReceptionistRulesGroup() {
  const [rules, setRules] = useState<ReceptionistRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/account/receptionist-rules")
      .then((res) => (res.ok ? res.json() : { rules: [] }))
      .then((data: { rules?: ReceptionistRule[] }) => live && setRules(data.rules ?? []))
      .catch(() => live && setRules([]));
    return () => {
      live = false;
    };
  }, []);

  const readRules = async (): Promise<ReceptionistRule[] | null> => {
    const res = await fetch("/api/account/receptionist-rules", { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as { rules?: unknown } | null;
    return Array.isArray(data?.rules) ? (data.rules as ReceptionistRule[]) : null;
  };

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      const result = await runCheckedWrite<{ rules: ReceptionistRule[]; apply: Apply | null }>({
        send: () => sendWrite(`/api/account/receptionist-rules?id=${encodeURIComponent(id)}`, "DELETE"),
        accept: (data) => {
          const d = data as { rules?: unknown; synced?: unknown; receptionistApply?: Apply | null } | null;
          if (!Array.isArray(d?.rules) || typeof d.synced !== "boolean") return null;
          return { rules: d.rules as ReceptionistRule[], apply: d.receptionistApply ?? null };
        },
        readBack: async () => {
          const now = await readRules();
          if (!now) return null;
          return now.some((r) => r.id === id) ? "absent" : { rules: now, apply: null };
        },
        onChecking: () => setNote(CHECKING),
      });
      if (result.kind === "confirmed") {
        setRules(result.value.rules);
        const apply = result.value.apply;
        setNote(
          apply?.state === "applied"
            ? "Removed, and the receptionist confirmed it."
            : apply
              ? `Removed from your saved corrections, but the receptionist hasn't confirmed it. ${apply.next ?? "Settings shows whether it has your latest changes."}`
              : "Removed from your saved corrections. The receptionist banner above shows whether it has your latest changes.",
        );
        return;
      }
      setNote(null);
      if (result.kind === "failed" && /already gone/i.test(result.message)) {
        const now = await readRules();
        if (now) setRules(now);
      }
      setError(result.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScGroup title="Corrections">
      <ScRow
        stack
        label="What the receptionist was told"
        hint="Add one from any call's page with “Correct the receptionist”. Every call follows these; safety rules always come first."
      >
        {rules === null ? null : rules.length === 0 ? (
          <p className="font-sans text-sm text-ash">No corrections yet.</p>
        ) : (
          <ul className="font-sans text-sm">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start justify-between gap-3 py-1.5">
                <span>{rule.text}</span>
                <button type="button" className="sc-btn" disabled={Boolean(busy)} onClick={() => void remove(rule.id)}>
                  {busy === rule.id ? "Removing…" : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {note ? (
          <p className="mt-2 font-sans text-sm text-ash" role="status">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 font-sans text-sm text-flare-dim" role="alert">
            {error}
          </p>
        ) : null}
      </ScRow>
    </ScGroup>
  );
}
