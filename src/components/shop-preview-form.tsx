"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FormField } from "@/components/shell-primitives";
import { savePreviewDraft } from "@/lib/preview-draft";
import { industryKind, OFFERED_TRADES, type IndustryKind, type Trade } from "@/lib/trades";

const PLACEHOLDER_NAME: Record<IndustryKind, string> = { field: "Summit HVAC", office: "Luxe Hair Studio" };
const PLACEHOLDER_SERVICES: Record<IndustryKind, string> = {
  field: "AC repair, furnace repair, tune-ups",
  office: "Cuts, color, consultations",
};

type Started = { token: string; callNumber: string; callTel: string; maxCalls: number };

type Status = {
  shopName: string;
  callsUsed: number;
  maxCalls: number;
  lastCallAt: string | null;
  summary: string | null;
  capture: { name?: string; phone?: string; serviceType?: string; urgency?: string; address?: string } | null;
  alertSent: boolean;
  replayable?: boolean;
};

const POLL_MS = 4000;

function practiceLine(trade: Trade): string {
  switch (trade) {
    case "HVAC":
      return "Pretend you're a customer with a broken AC.";
    case "Plumbing":
      return "Pretend you're a customer with a leak under the sink.";
    case "Electrical":
      return "Pretend you're a customer who just lost power to half the house.";
    default:
      return industryKind(trade) === "office"
        ? "Pretend you're a new customer who wants to book a time."
        : "Pretend you're a customer who needs someone out this week.";
  }
}

export function ShopPreviewForm() {
  const [shopName, setShopName] = useState("");
  const [trade, setTrade] = useState<Trade>("HVAC");
  const [serviceArea, setServiceArea] = useState("");
  const [services, setServices] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState<Started | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [share, setShare] = useState<{ url?: string; busy: boolean; note?: string }>({ busy: false });

  useEffect(() => {
    if (!started || started.token === "accepted") return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/preview/${started.token}`, { cache: "no-store" });
        if (res.ok && !stopped) setStatus((await res.json()) as Status);
      } catch {
        /* Keep polling; a missed tick only delays the card. */
      }
    };
    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [started]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopName,
          trade,
          serviceArea: serviceArea || undefined,
          services: services
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ownerPhone,
          consent,
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Started> & { error?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? "We couldn't set up your preview. Try again.");
        return;
      }
      savePreviewDraft({ token: data.token, shopName, ownerPhone, trade });
      setStarted({
        token: data.token,
        callNumber: data.callNumber ?? "",
        callTel: data.callTel ?? "",
        maxCalls: data.maxCalls ?? 2,
      });
    } catch {
      setError("We couldn't reach Orvius. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function shareCall() {
    if (!started) return;
    setShare({ busy: true });
    try {
      const res = await fetch(`/api/preview/${started.token}/share`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setShare({ busy: false, note: data.error ?? "The replay isn't ready yet. Try again in a moment." });
        return;
      }
      const text = `I called my business and AI answered as ${shopName}. Watch the call:`;
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Call Replay", text, url: data.url }).catch(() => null);
        setShare({ busy: false, url: data.url });
        return;
      }
      await navigator.clipboard?.writeText(data.url).catch(() => null);
      setShare({ busy: false, url: data.url, note: "Link copied." });
    } catch {
      setShare({ busy: false, note: "We couldn't reach Orvius. Try again." });
    }
  }

  if (started) {
    const capture = status?.capture;
    const left = status ? Math.max(0, status.maxCalls - status.callsUsed) : started.maxCalls;
    return (
      <div className="shop-preview-live" role="status" aria-live="polite">
        <p className="tier1-eyebrow type-eyebrow">Step 2</p>
        <h3 className="tier1-section-title type-headline">
          Call <a href={`tel:${started.callTel}`}>{started.callNumber}</a> from {ownerPhone}.
        </h3>
        <p className="tier1-section-lead font-sans">
          You&apos;ll hear it answer as {shopName}. {practiceLine(trade)} {left} of{" "}
          {started.maxCalls} preview calls left today.
        </p>

        <div className="shop-preview-card">
          {capture ? (
            <>
              <p className="label">What your owner text would say</p>
              <p className="shop-preview-card-title">
                {[capture.urgency, capture.serviceType].filter(Boolean).join(" · ") || "New call"}
              </p>
              <ul className="shop-preview-card-lines font-sans">
                {capture.name ? <li>{capture.name}</li> : null}
                {capture.address ? <li>{capture.address}</li> : null}
                {capture.phone ? <li>{capture.phone}</li> : null}
              </ul>
              {status?.summary ? <p className="font-sans text-sm text-ash-soft">{status.summary}</p> : null}
              <p className="font-sans text-sm text-ash-soft">
                {status?.alertSent ? "We texted this to your phone too." : "Your text is on its way."}
              </p>
              {status?.replayable ? (
                <div className="shop-preview-share">
                  <button type="button" className="ov-btn ov-btn--quiet" onClick={() => void shareCall()} disabled={share.busy}>
                    {share.busy ? "Making your replay…" : "Share this call"}
                  </button>
                  {share.url ? (
                    <a className="font-sans text-sm" href={share.url} target="_blank" rel="noreferrer">
                      {share.url.replace(/^https?:\/\//, "")}
                    </a>
                  ) : null}
                  {share.note ? <span className="font-sans text-sm text-ash-soft">{share.note}</span> : null}
                </div>
              ) : null}
            </>
          ) : status?.lastCallAt ? (
            <p className="font-sans text-sm text-ash-soft">Call in progress. The job card appears when you hang up.</p>
          ) : (
            <p className="font-sans text-sm text-ash-soft">Waiting for your call…</p>
          )}
        </div>

        <div className="shop-preview-actions">
          <Link href={`/pricing?preview=${started.token}`} className="ov-btn ov-btn--solid">
            Put this on my business line
          </Link>
          <button type="button" className="ov-btn ov-btn--quiet" onClick={() => setStarted(null)}>
            Edit details
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        Website
        <input name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Business name" required>
          <input
            className="input"
            required
            minLength={2}
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder={PLACEHOLDER_NAME[industryKind(trade)]}
            autoComplete="organization"
          />
        </FormField>
        <FormField label="Business type" required>
          <select className="input" value={trade} onChange={(e) => setTrade(e.target.value as Trade)}>
            {OFFERED_TRADES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Your mobile" required>
          <input
            className="input"
            required
            type="tel"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            autoComplete="tel"
            inputMode="tel"
          />
        </FormField>
      </div>
      <FormField label="Service area">
        <input className="input" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} placeholder="Austin and Round Rock" />
      </FormField>
      <FormField label="Services (comma separated)">
        <input
          className="input"
          value={services}
          onChange={(e) => setServices(e.target.value)}
          placeholder={PLACEHOLDER_SERVICES[industryKind(trade)]}
        />
      </FormField>
      {error ? (
        <p role="alert" className="font-sans text-sm text-flare-dim">
          {error}
        </p>
      ) : null}
      <label className="flex items-start gap-3 font-sans text-sm leading-relaxed text-ash-soft">
        <input
          type="checkbox"
          required
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 size-4 shrink-0 accent-[var(--flare)]"
        />
        <span>
          Text me the job card from my preview call. One text per call, reply STOP to opt out. See the{" "}
          <Link href="/sms-terms" className="editorial-link">
            SMS terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="editorial-link">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <button type="submit" disabled={loading} className={`btn btn-void w-full sm:w-auto ${loading ? "btn-loading" : ""}`}>
        Hear my receptionist
      </button>
    </form>
  );
}
