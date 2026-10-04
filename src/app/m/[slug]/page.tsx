"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import "@/app/public-field.css";
import "@/app/b/[slug]/book.css";
import "./plans.css";

type Plan = { id: string; name: string; priceCents: number; interval: string; visitsPerYear: number; perks: string | null };
type Info = { business: { name: string; phone: string | null }; plans: Plan[] };

function price(cents: number, interval: string) {
  const dollars = cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
  return { dollars, per: interval === "year" ? "/year" : "/month" };
}

function visits(n: number) {
  if (!n) return null;
  if (n === 1) return "1 visit a year included";
  if (n === 12) return "A visit every month included";
  return `${n} visits a year included`;
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : raw;
}

export default function PlansPage() {
  const { slug } = useParams<{ slug: string }>();
  const [joined, setJoined] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setJoined(new URLSearchParams(window.location.search).get("joined") === "1");
    void fetch(`/api/public/plans/${encodeURIComponent(slug)}`).then(async (res) => {
      if (res.status === 404) return setMissing(true);
      if (!res.ok) return setError("Plans didn't load. Refresh to try again.");
      const data: Info = await res.json();
      setInfo(data);
      if (data.plans.length === 1) setPlanId(data.plans[0].id);
    });
  }, [slug]);

  const join = async () => {
    if (!planId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/plans/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, ...form }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "That didn't go through. Try again or call us.");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (joined) {
    return (
      <main className="pf pf--center">
        <div className="pf-head">
          <p className="pf-kicker">{info?.business.name ?? "Welcome"}</p>
          <h1 className="pf-title">You&apos;re a member</h1>
          <p className="pf-sub">We&apos;ll text you when your next included visit is due.</p>
        </div>
      </main>
    );
  }

  if (missing) {
    return (
      <main className="pf pf--center">
        <div className="pf-head">
          <h1 className="pf-title">Plans aren&apos;t available online</h1>
          <p className="pf-sub">Call the business to ask about a maintenance plan.</p>
        </div>
      </main>
    );
  }

  if (!info) {
    return (
      <main className="pf pf--center" aria-busy="true">
        <p className="pf-muted">{error ?? "Loading plans…"}</p>
      </main>
    );
  }

  const phone = info.business.phone;
  const chosen = info.plans.find((p) => p.id === planId) ?? null;

  return (
    <main className="pf bk">
      <div className="pf-head">
        <p className="pf-kicker">Maintenance plans</p>
        <h1 className="pf-title">{info.business.name}</h1>
        {phone ? (
          <p className="pf-sub">
            Questions? <a href={`tel:${phone}`}>{formatPhone(phone)}</a>
          </p>
        ) : null}
      </div>

      <section className="pf-card" aria-label="Plans">
        <div className="mp-plans" role="radiogroup" aria-label="Choose a plan">
          {info.plans.map((p) => {
            const { dollars, per } = price(p.priceCents, p.interval);
            const v = visits(p.visitsPerYear);
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={planId === p.id}
                className={`mp-plan ${planId === p.id ? "is-on" : ""}`}
                onClick={() => setPlanId(p.id)}
              >
                <span className="mp-name">{p.name}</span>
                <span className="mp-price">
                  {dollars}
                  <small>{per}</small>
                </span>
                {v ? <span className="mp-line">{v}</span> : null}
                {p.perks
                  ? p.perks
                      .split(/\n|;/)
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .slice(0, 6)
                      .map((line) => (
                        <span key={line} className="mp-line">
                          {line}
                        </span>
                      ))
                  : null}
              </button>
            );
          })}
        </div>
      </section>

      {chosen ? (
        <form
          className="pf-card"
          aria-label="Your details"
          onSubmit={(e) => {
            e.preventDefault();
            void join();
          }}
        >
          <h2 className="pf-h2">Your details</h2>
          <input
            className="pf-input"
            placeholder="Full name"
            autoComplete="name"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-label="Full name"
          />
          <input
            className="pf-input"
            type="tel"
            placeholder="Mobile number"
            autoComplete="tel"
            required
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            aria-label="Mobile number"
          />
          <input
            className="pf-input"
            type="email"
            placeholder="Email (for receipts)"
            autoComplete="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-label="Email"
          />
          <input
            className="bk-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            name="website"
          />
          <p className="pf-muted">
            You pay {info.business.name} directly through Stripe and can cancel any time. By joining you agree to get
            texts about your plan visits. Reply STOP to opt out.
          </p>
          {error ? (
            <p className="pf-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="pf-btn pf-btn--primary" disabled={busy}>
            {busy ? "Opening secure checkout…" : `Join ${chosen.name}`}
          </button>
        </form>
      ) : null}

      <p className="pf-muted bk-foot">Plans by Orvius</p>
    </main>
  );
}
