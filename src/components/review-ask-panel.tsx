"use client";

import { useCallback, useEffect, useState } from "react";

import { ShellLoading, ShellPanel } from "@/components/shell-primitives";

type AccountSlice = {
  business?: { googleReviewUrl?: string | null };
};

/**
 * Optional Google / review link — one SMS after a successful job outcome.
 */
export function ReviewAskPanel() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const body = (await res.json()) as AccountSlice & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load review link");
      setUrl(body.business?.googleReviewUrl?.trim() ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleReviewUrl: url.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Could not save");
      setUrl(body.business?.googleReviewUrl?.trim() ?? "");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ShellPanel title="Reviews" dense>
        <ShellLoading />
      </ShellPanel>
    );
  }

  return (
    <ShellPanel title="Reviews" dense>
      <p className="account-plan-name font-sans">
        {url.trim() ? "Review ask is on" : "No review link yet"}
      </p>
      <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
        After a successful job, Orvius texts the customer once with your public
        review link. Leave blank to stay silent — we never invent a Google URL.
      </p>

      <label className="onboarding-field font-sans mt-5">
        <span className="onboarding-label">Public review URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setSaved(false);
          }}
          className="onboarding-input"
          placeholder="https://g.page/r/…"
          disabled={saving}
        />
        <span className="onboarding-hint">
          Google Business, Yelp, or your own review page — https only.
        </span>
      </label>

      {error ? (
        <p className="os-own-color panel-action-error mt-4 font-sans text-sm">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="mt-4 font-sans text-sm text-ash">Saved.</p>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          className="btn btn-void"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save review link"}
        </button>
      </div>
    </ShellPanel>
  );
}
