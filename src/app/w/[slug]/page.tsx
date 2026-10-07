"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import "./chat.css";

type Info = { business: { name: string; phone: string | null }; booking: string | null };

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : raw;
}

function Chat() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearchParams();
  const embedded = search.get("embed") === "1";
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState<{ phone: string | null } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", message: "", website: "" });
  const [sent, setSent] = useState<{ message: string; texted: boolean; safety: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/public/chat/${encodeURIComponent(slug)}`).then(async (res) => {
      if (res.status === 404) {
        const body = await res.json().catch(() => null);
        return setMissing({ phone: body?.business?.phone ?? null });
      }
      if (res.ok) setInfo(await res.json());
    });
  }, [slug]);

  const close = () => window.parent?.postMessage({ type: "orvius-chat:close" }, "*");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/chat/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, page: search.get("page") ?? undefined }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That didn't send. Try again.");
        return;
      }
      setSent({ message: form.message, texted: data.texted, safety: data.safety });
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <main className={`wc ${embedded ? "is-embedded" : ""}`}>
        <p className="wc-note">
          Chat isn&apos;t available right now.
          {missing.phone ? (
            <>
              {" "}
              <a href={`tel:${missing.phone}`}>Call {formatPhone(missing.phone)}</a>
            </>
          ) : null}
        </p>
      </main>
    );
  }

  const name = info?.business.name ?? "";
  const phone = info?.business.phone ?? null;

  return (
    <main className={`wc ${embedded ? "is-embedded" : ""}`}>
      <header className="wc-head">
        <div>
          <strong>{name || " "}</strong>
          <span>Typically replies by text in minutes</span>
        </div>
        {embedded ? (
          <button type="button" className="wc-x" onClick={close} aria-label="Close chat">
            ×
          </button>
        ) : null}
      </header>

      <div className="wc-body">
        <div className="wc-bubble">
          Hi! How can we help? Leave a message and your mobile number and we&apos;ll text you right back.
        </div>
        {sent ? (
          <>
            <div className="wc-bubble wc-bubble--me">{sent.message}</div>
            {sent.safety ? (
              <div className="wc-bubble wc-bubble--warn">
                If anyone is in danger, leave the area and call 911.{" "}
                {phone ? (
                  <>
                    Then call us at <a href={`tel:${phone}`}>{formatPhone(phone)}</a>.
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="wc-bubble">
              {sent.texted
                ? "Got it. We just texted you so you can keep chatting from your phone. You can close this window."
                : `Got it. We'll get back to you at ${formatPhone(form.phone)} shortly.`}
            </div>
            {info?.booking ? (
              <a className="wc-link" href={info.booking} target="_blank" rel="noreferrer">
                Or pick a time online →
              </a>
            ) : null}
          </>
        ) : null}
      </div>

      {!sent ? (
        <form
          className="wc-form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <textarea
            required
            placeholder="How can we help?"
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            aria-label="Your message"
            maxLength={1000}
          />
          <div className="wc-row">
            <input
              placeholder="Name"
              autoComplete="name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-label="Name"
            />
            <input
              required
              type="tel"
              placeholder="Mobile number"
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              aria-label="Mobile number"
            />
          </div>
          <input
            className="wc-hp"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            name="website"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          {error ? (
            <p className="wc-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="wc-send" disabled={busy || !form.message.trim() || !form.phone.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
          <p className="wc-fine">
            By sending, you agree to get texts from {name || "this business"} about your message. Reply STOP to opt out.
            {info?.booking ? (
              <>
                {" "}
                <a href={info.booking} target="_blank" rel="noreferrer">
                  Book online
                </a>
              </>
            ) : null}
          </p>
        </form>
      ) : null}
    </main>
  );
}

export default function WebChatPage() {
  return (
    <Suspense fallback={null}>
      <Chat />
    </Suspense>
  );
}
