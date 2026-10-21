"use client";

import { OsShell } from "@/components/os-shell";
import { ProEmptyState } from "@/components/pro-page-chrome";
import { DashboardSkeleton } from "@/components/shell-skeleton";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import "./messages.css";

type Thread = {
  phone: string;
  name: string | null;
  customerId: string | null;
  lastBody: string;
  lastDirection: "in" | "out";
  lastAuthor: "customer" | "orvius" | "owner";
  lastAt: string;
  unread: number;
  optedOut: boolean;
};

type Entry =
  | {
      kind: "text";
      id: string;
      at: string;
      direction: "in" | "out";
      author: "customer" | "orvius" | "owner";
      body: string;
      deliveryStatus?: string | null;
      photos?: number;
    }
  | {
      kind: "call";
      id: string;
      at: string;
      direction: string;
      status: string;
      durationSec: number | null;
      summary: string | null;
    };

type ThreadDetail = {
  phone: string;
  customer: { id: string; name: string | null; address: string | null; interactionCount: number } | null;
  optedOut: boolean;
  takenOver: { by: string; since: string } | null;
  entries: Entry[];
};

const SMS_SEGMENT = 160;

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function relativeTime(iso: string, now = Date.now()) {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function stamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessagesInner() {
  const params = useSearchParams();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string | null>(params.get("phone"));
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [handing, setHanding] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendKey = useRef<{ key: string; phone: string; body: string } | null>(null);

  const loadThreads = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/messages?${new URLSearchParams({ q })}`);
      if (!res.ok) {
        setListError("Messages didn't load. Retry in a moment.");
        return;
      }
      const data = await res.json();
      setThreads(data.threads ?? []);
      setListError(null);
    } catch {
      setListError("Network error. Check your connection and retry.");
    }
  }, []);

  const loadThread = useCallback(async (phone: string, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const res = await fetch(`/api/messages/thread?${new URLSearchParams({ phone })}`);
      if (res.ok) {
        const data: ThreadDetail = await res.json();
        setDetail(data);
        setThreads((prev) =>
          prev?.map((t) => (t.phone === data.phone ? { ...t, unread: 0 } : t)) ?? prev,
        );
      } else if (!quiet) {
        setDetail(null);
        setError((await res.json().catch(() => null))?.error ?? "That conversation didn't load.");
      }
    } catch {
      if (!quiet) setError("Network error. That conversation didn't load — pick it again to retry.");
    } finally {
      if (!quiet) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => void loadThreads(query), query ? 200 : 0);
    return () => clearTimeout(id);
  }, [query, loadThreads]);

  useEffect(() => {
    if (!active) return;
    setError(null);
    void loadThread(active);
  }, [active, loadThread]);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadThreads(query);
      if (active) void loadThread(active, true);
    }, 15000);
    return () => clearInterval(id);
  }, [active, query, loadThreads, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [detail?.entries.length, detail?.phone]);

  const toggleTakeover = async () => {
    if (!detail || handing) return;
    setHanding(true);
    setError(null);
    try {
      const res = await fetch("/api/command/takeover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: detail.phone, release: Boolean(detail.takenOver) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "That didn't save. Orvius is still handling texts as before.");
        return;
      }
      await loadThread(detail.phone, true);
    } catch {
      setError("Network error. Nothing changed.");
    } finally {
      setHanding(false);
    }
  };

  const send = async () => {
    const body = draft.trim();
    if (!active || !body || sending) return;
    setSending(true);
    setError(null);
    const sent = sendKey.current;
    const operationKey = sent && sent.phone === active && sent.body === body ? sent.key : crypto.randomUUID();
    sendKey.current = { key: operationKey, phone: active, body };
    try {
      const res = await fetch("/api/messages/thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: active, body, operationKey }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sent === true) {
        sendKey.current = null;
        setDraft("");
        if (data.thread) setDetail(data.thread);
        void loadThreads(query);
        return;
      }
      if (res.status === 202) {
        setError(data?.error ?? "This text may have gone out. Check the thread before writing it again.");
        void loadThread(active, true);
        return;
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 429) sendKey.current = null;
      if (data?.refused) sendKey.current = null;
      setError(
        data?.error ??
          (res.ok || res.status >= 500
            ? "Orvius couldn't confirm this text. Press Send again to check; it won't go twice."
            : "The text didn't send. Try again."),
      );
    } catch {
      setError("No answer from Orvius, so the text may have gone out. Press Send again to check; it won't go twice.");
    } finally {
      setSending(false);
    }
  };

  const startNew = () => {
    const digits = newPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a 10-digit phone number.");
      return;
    }
    setActive(newPhone);
    setNewPhone("");
  };

  const activeThread = threads?.find((t) => t.phone === detail?.phone);
  const title = detail?.customer?.name || activeThread?.name || (detail ? formatPhone(detail.phone) : "");
  const segments = Math.max(1, Math.ceil(draft.length / SMS_SEGMENT));

  return (
    <div className={`msg-shell font-sans ${active ? "has-active" : ""}`}>
      <aside className="msg-list" aria-label="Conversations">
        <div className="msg-list-head">
          <input
            className="msg-search"
            type="search"
            placeholder="Search name, number, or text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search conversations"
          />
          <form
            className="msg-new"
            onSubmit={(e) => {
              e.preventDefault();
              startNew();
            }}
          >
            <input
              type="tel"
              placeholder="New text to (555) 123-4567"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              aria-label="Phone number for a new text"
            />
            <button type="submit" className="btn btn-secondary text-sm">
              Start
            </button>
          </form>
        </div>
        {listError ? (
          <p className="msg-note msg-note--error" role="alert">
            {listError}
          </p>
        ) : null}
        {threads === null ? (
          <DashboardSkeleton />
        ) : !threads.length ? (
          <ProEmptyState
            compact
            title={query ? "No matches" : "No texts yet"}
            body={
              query
                ? "Try a name, the last four digits, or a word from the text."
                : "When a customer texts your line, the conversation shows up here. Reminders and confirmations Orvius sends land here too."
            }
          />
        ) : (
          <ul className="msg-threads">
            {threads.map((thread) => (
              <li key={thread.phone}>
                <button
                  type="button"
                  className={`msg-thread ${detail?.phone === thread.phone ? "is-active" : ""} ${thread.unread ? "is-unread" : ""}`}
                  onClick={() => setActive(thread.phone)}
                >
                  <span className="msg-thread-top">
                    <span className="msg-thread-name">{thread.name || formatPhone(thread.phone)}</span>
                    <span className="msg-thread-time">{relativeTime(thread.lastAt)}</span>
                  </span>
                  <span className="msg-thread-preview">
                    {thread.lastDirection === "out"
                      ? thread.lastAuthor === "owner"
                        ? "You: "
                        : "Orvius: "
                      : ""}
                    {thread.lastBody}
                  </span>
                  {thread.unread ? <span className="msg-badge">{thread.unread}</span> : null}
                  {thread.optedOut ? <span className="msg-tag">Opted out</span> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="msg-pane" aria-label="Conversation">
        {!active ? (
          <div className="msg-pane-empty">
            <p className="msg-pane-empty-title">Pick a conversation</p>
            <p>Texts and calls with the same customer show up together, oldest first.</p>
          </div>
        ) : detailLoading && !detail ? (
          <DashboardSkeleton />
        ) : (
          <>
            <header className="msg-pane-head">
              <button type="button" className="msg-back" onClick={() => setActive(null)} aria-label="Back to conversations">
                ←
              </button>
              <div className="msg-pane-title">
                <strong>{title}</strong>
                {detail ? <span>{formatPhone(detail.phone)}</span> : null}
              </div>
              {detail?.customer ? (
                <Link className="btn btn-secondary text-sm" href={`/dashboard/customers/${detail.customer.id}`}>
                  Customer
                </Link>
              ) : null}
              {detail ? (
                <a className="btn btn-secondary text-sm" href={`tel:${detail.phone}`}>
                  Call
                </a>
              ) : null}
            </header>

            <div className="msg-scroll" ref={scrollRef}>
              {!detail?.entries.length ? (
                <p className="msg-note">No history with this number yet. Your first text starts the thread.</p>
              ) : (
                detail.entries.map((entry) =>
                  entry.kind === "call" ? (
                    <div key={`c-${entry.id}`} className="msg-call">
                      <span className="msg-call-label">
                        {entry.direction === "outbound" ? "Outgoing call" : "Call"}
                        {entry.durationSec ? ` · ${Math.max(1, Math.round(entry.durationSec / 60))} min` : ""}
                        {" · "}
                        {stamp(entry.at)}
                      </span>
                      {entry.summary ? <span className="msg-call-summary">{entry.summary}</span> : null}
                      <Link href={`/dashboard/calls/${entry.id}`} className="msg-call-link">
                        Open call
                      </Link>
                    </div>
                  ) : (
                    <div
                      key={`t-${entry.id}`}
                      className={`msg-bubble-row ${entry.direction === "out" ? "is-out" : "is-in"}`}
                    >
                      {entry.photos ? (
                        <div className="msg-photos">
                          {Array.from({ length: entry.photos }, (_, i) => {
                            const src = `/api/messages/media?id=${encodeURIComponent(entry.id)}&i=${i}`;
                            return (
                              <MessagePhoto key={i} src={src} index={i} />
                            );
                          })}
                        </div>
                      ) : null}
                      {entry.photos && entry.body === "Sent a photo" ? null : (
                        <div className={`msg-bubble msg-bubble--${entry.author}`}>{entry.body}</div>
                      )}
                      <span className="msg-meta">
                        {entry.direction === "out" ? `${entry.author === "owner" ? "You" : "Orvius"} · ` : ""}
                        {stamp(entry.at)}
                        {entry.direction === "out" ? <DeliveryNote status={entry.deliveryStatus ?? null} /> : null}
                      </span>
                    </div>
                  ),
                )
              )}
            </div>

            {detail ? (
              <div className="msg-takeover" role="status">
                <p className="msg-note">
                  {detail.takenOver
                    ? `You have this conversation (${detail.takenOver.by}). Orvius won't text this customer until you hand it back.`
                    : "Orvius handles texts with this customer. Take over to stop its automatic texts while you talk to them."}
                </p>
                <button type="button" className="ox-btn ox-btn--quiet ox-btn--sm" disabled={handing} onClick={() => void toggleTakeover()}>
                  {handing ? "Saving…" : detail.takenOver ? "Hand back to Orvius" : "Take over"}
                </button>
              </div>
            ) : null}

            {detail?.optedOut ? (
              <p className="msg-note msg-note--warn">
                This customer replied STOP. You can&apos;t text them until they text START. Calling is still fine.
              </p>
            ) : (
              <form
                className="msg-compose"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                {error ? (
                  <p className="msg-note msg-note--error" role="alert">
                    {error}
                  </p>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder="Text this customer from your business line"
                  maxLength={1200}
                  rows={2}
                  aria-label="Message"
                />
                <div className="msg-compose-foot">
                  <span>
                    {draft.length ? `${draft.length} chars · ${segments} text${segments > 1 ? "s" : ""}` : "Enter to send · Shift+Enter for a new line"}
                  </span>
                  <button type="submit" className="btn btn-void text-sm" disabled={!draft.trim() || sending}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
                <p className="msg-hint">
                  While you&apos;re texting someone, their replies come to you, and Orvius won&apos;t auto-reply for 7 days.
                </p>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <OsShell
      title="Messages"
      actions={
        <Link href="/dashboard" className="btn btn-secondary text-sm">
          Command
        </Link>
      }
    >
      <Suspense fallback={<DashboardSkeleton />}>
        <MessagesInner />
      </Suspense>
    </OsShell>
  );
}

/** What the record says about an outbound text, and nothing it doesn't. */
function DeliveryNote({ status }: { status: string | null }) {
  switch (status) {
    case "delivered":
    case "read":
      return <> · Delivered</>;
    case "failed":
    case "undelivered":
      return <span className="msg-failed"> · Not delivered. Call them instead.</span>;
    case "held":
      return <span className="msg-failed"> · Held, not sent: texting isn&apos;t verified with the carriers yet.</span>;
    case "held_for_human":
      return <> · Held, not sent: someone had taken this conversation over.</>;
    case "unknown_submission":
      return <span className="msg-failed"> · Unknown: the carrier never said whether this left. Orvius won&apos;t resend it.</span>;
    case "queued":
    case "accepted":
    case "sending":
    case "sent":
      return <> · Sent, waiting on the carrier</>;
    default:
      return null;
  }
}

function MessagePhoto({ src, index }: { src: string; index: number }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <span className="msg-photo msg-photo--missing" role="img" aria-label={`Photo ${index + 1} is unavailable`}>
        Photo unavailable
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noreferrer" className="msg-photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- authed proxy, not optimisable */}
      <img src={src} alt={`Photo ${index + 1} from the customer`} loading="lazy" onError={() => setMissing(true)} />
    </a>
  );
}
