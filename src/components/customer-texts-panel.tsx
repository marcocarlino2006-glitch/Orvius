"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ThreadMessage = {
  id: string;
  direction: "inbound" | "outbound" | string;
  body: string;
  status: string | null;
  createdAt: string;
};

type CustomerTextsPanelProps = {
  customerId: string;
  customerPhone: string | null;
};

export function CustomerTextsPanel({
  customerId,
  customerPhone,
}: CustomerTextsPanelProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/sms`);
      if (!res.ok) throw new Error("Could not load texts");
      const data = (await res.json()) as { messages?: ThreadMessage[] };
      setMessages(data.messages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load texts");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = (await res.json()) as {
        error?: string;
        body?: string;
        messageId?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      setDraft("");
      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId ?? `local-${Date.now()}`,
          direction: "outbound",
          body: data.body ?? body,
          status: "sent",
          createdAt: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <p className="font-sans text-sm text-ash">Loading texts…</p>;
  }

  return (
    <div className="customer-texts font-sans">
      {!customerPhone ? (
        <p className="text-sm text-ash">No phone on this record — cannot text.</p>
      ) : null}

      <div className="customer-texts-thread" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <p className="text-sm text-ash">
            No texts yet. Inbound SMS and confirm/review messages land here.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`customer-texts-bubble ${
                m.direction === "outbound"
                  ? "customer-texts-out"
                  : "customer-texts-in"
              }`}
            >
              <p className="customer-texts-body whitespace-pre-wrap">{m.body}</p>
              <p className="customer-texts-meta">
                {m.direction === "outbound" ? "You" : "Customer"} ·{" "}
                {new Date(m.createdAt).toLocaleString()}
              </p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="customer-texts-compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          className="customer-texts-input"
          rows={2}
          value={draft}
          disabled={!customerPhone || sending}
          placeholder={
            customerPhone ? "Reply by SMS…" : "Add a phone number first"
          }
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1400}
        />
        <button
          type="submit"
          className="btn btn-void text-sm"
          disabled={!customerPhone || sending || !draft.trim()}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>

      {error ? (
        <p className="mt-2 text-sm text-signal" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
