"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { RecordType, RecordView } from "@/lib/record-types";

type OpenArgs = { type: RecordType; id: string };

type DrawerContextValue = {
  open: (args: OpenArgs) => void;
  close: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function useRecordDrawer() {
  return useContext(DrawerContext);
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; record: RecordView }
  | { kind: "error"; message: string; status: number };

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TYPE_LABEL: Record<RecordType, string> = {
  call: "Call",
  lead: "Lead",
  customer: "Customer",
  job: "Job",
};

export function RecordDrawerProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<OpenArgs | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [showTranscript, setShowTranscript] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const load = useCallback(async (args: OpenArgs) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/records/${args.type}/${args.id}`);
      const data = (await res.json().catch(() => null)) as
        | { record?: RecordView; error?: string }
        | null;
      if (!res.ok || !data?.record) {
        setState({
          kind: "error",
          status: res.status,
          message:
            res.status === 404
              ? "This record is no longer on the shop."
              : res.status === 401
                ? "Your session expired. Sign in again to open records."
                : "The record could not load.",
        });
        return;
      }
      setState({ kind: "ready", record: data.record });
    } catch {
      setState({
        kind: "error",
        status: 0,
        message: "You appear to be offline. The record will load when the connection returns.",
      });
    }
  }, []);

  const open = useCallback(
    (args: OpenArgs) => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setShowTranscript(false);
      setTarget(args);
      void load(args);
    },
    [load],
  );

  const close = useCallback(() => {
    setTarget(null);
    setState({ kind: "idle" });
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!target) return;
    panelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, close]);

  const value = useMemo(() => ({ open, close }), [open, close]);

  return (
    <DrawerContext.Provider value={value}>
      {children}
      {target ? (
        <div className="rd-root" role="presentation">
          <button
            type="button"
            className="rd-backdrop"
            aria-label="Close record"
            onClick={close}
          />
          <aside
            ref={panelRef}
            tabIndex={-1}
            className="rd-panel font-sans"
            role="dialog"
            aria-modal="true"
            aria-label={`${TYPE_LABEL[target.type]} record`}
          >
            <header className="rd-head">
              <div className="rd-head-copy">
                <p className="rd-kicker">{TYPE_LABEL[target.type]}</p>
                <h2 className="rd-title">
                  {state.kind === "ready" ? state.record.title : "Loading record…"}
                </h2>
                {state.kind === "ready" && state.record.subtitle ? (
                  <p className="rd-subtitle">{state.record.subtitle}</p>
                ) : null}
              </div>
              <button type="button" className="rd-close" onClick={close} aria-label="Close">
                <svg viewBox="0 0 16 16" aria-hidden>
                  <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <div className="rd-body">
              {state.kind === "loading" ? (
                <div className="rd-skeleton" aria-busy="true">
                  <span className="skeleton" />
                  <span className="skeleton" />
                  <span className="skeleton" />
                </div>
              ) : null}

              {state.kind === "error" ? (
                <div className="ox-state ox-state--failure">
                  <p className="ox-state-title">Record unavailable</p>
                  <p className="ox-state-copy">{state.message}</p>
                  <button
                    type="button"
                    className="ox-btn ox-btn--primary"
                    onClick={() => void load(target)}
                  >
                    Retry
                  </button>
                </div>
              ) : null}

              {state.kind === "ready" ? (
                <RecordBody
                  record={state.record}
                  showTranscript={showTranscript}
                  onToggleTranscript={() => setShowTranscript((v) => !v)}
                  onOpen={open}
                />
              ) : null}
            </div>

            {state.kind === "ready" ? (
              <footer className="rd-foot">
                {state.record.next ? (
                  <Link href={state.record.next.href} className="ox-btn ox-btn--primary" onClick={close}>
                    {state.record.next.label}
                  </Link>
                ) : null}
                <Link href={state.record.fullHref} className="ox-btn ox-btn--quiet" onClick={close}>
                  Open full record
                </Link>
              </footer>
            ) : null}
          </aside>
        </div>
      ) : null}
    </DrawerContext.Provider>
  );
}

function RecordBody({
  record,
  showTranscript,
  onToggleTranscript,
  onOpen,
}: {
  record: RecordView;
  showTranscript: boolean;
  onToggleTranscript: () => void;
  onOpen: (args: OpenArgs) => void;
}) {
  const captured = record.captured.filter((f) => f.value);
  const missing = record.captured.filter((f) => !f.value && f.label !== "Scheduled" && f.label !== "Email");

  return (
    <>
      {record.next ? (
        <section className="rd-next" aria-label="Next permitted action">
          <p className="rd-section-label">Next action</p>
          <p className="rd-next-title">{record.next.label}</p>
          <p className="rd-next-detail">{record.next.detail}</p>
        </section>
      ) : null}

      <section className="rd-section" aria-label="Relationship path">
        <p className="rd-section-label">Relationship path</p>
        <ol className="rd-path">
          {record.path.map((node) => {
            const clickable = node.recordType && node.recordId && node.recordId !== record.id;
            const body = (
              <>
                <span className="rd-path-label">{node.label}</span>
                <span className="rd-path-value">{node.value ? sentenceCase(node.value) : "Not yet"}</span>
              </>
            );
            return (
              <li
                key={node.type}
                className={`rd-path-node ${node.value ? "is-present" : "is-missing"} ${
                  node.recordId === record.id ? "is-current" : ""
                }`}
              >
                {clickable ? (
                  <button
                    type="button"
                    className="rd-path-btn"
                    onClick={() => onOpen({ type: node.recordType!, id: node.recordId! })}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="rd-path-btn">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {record.source ? (
        <section className="rd-section" aria-label="Source">
          <p className="rd-section-label">Source</p>
          <p className="rd-line">
            {record.source.channel}
            {record.source.from ? ` · ${record.source.from}` : ""}
          </p>
          <p className="rd-meta">
            <time dateTime={record.source.at}>{formatWhen(record.source.at)}</time>
          </p>
          {record.summary ? <p className="rd-summary">{record.summary}</p> : null}
          {record.transcript ? (
            <>
              <button type="button" className="rd-link" onClick={onToggleTranscript}>
                {showTranscript ? "Hide transcript" : "Show transcript"}
              </button>
              {showTranscript ? <pre className="rd-transcript">{record.transcript}</pre> : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="rd-section" aria-label="Captured details">
        <p className="rd-section-label">Captured details</p>
        {captured.length ? (
          <dl className="rd-fields">
            {captured.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.label === "Scheduled" && field.value ? formatWhen(field.value) : field.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="rd-meta">Nothing structured was captured.</p>
        )}
        {missing.length ? (
          <p className="rd-missing">Missing: {missing.map((f) => f.label.toLowerCase()).join(", ")}</p>
        ) : null}
      </section>

      {record.decisions.length ? (
        <section className="rd-section" aria-label="Decisions">
          <p className="rd-section-label">What Orvius decided</p>
          <ul className="rd-decisions">
            {record.decisions.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {record.history?.length ? (
        <section className="rd-section" aria-label="Relationship history">
          <p className="rd-section-label">History</p>
          <ul className="rd-history">
            {record.history.map((h) => (
              <li key={`${h.type}-${h.id}`}>
                <button type="button" className="rd-history-btn" onClick={() => onOpen({ type: h.type, id: h.id })}>
                  <span>{h.title}</span>
                  <span className="rd-meta">
                    {TYPE_LABEL[h.type]} · {h.status ?? "—"} · {formatWhen(h.at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rd-section" aria-label="Event history">
        <p className="rd-section-label">Event history</p>
        {record.events.length ? (
          <ol className="rd-events">
            {record.events.map((event) => (
              <li key={`${event.at}-${event.label}`} className={`rd-event rd-event--${event.tone}`}>
                <span className="rd-event-dot" aria-hidden />
                <div>
                  <p className="rd-event-label">{event.label}</p>
                  <p className="rd-meta">
                    <time dateTime={event.at}>{formatWhen(event.at)}</time>
                    {event.detail ? ` · ${event.detail}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rd-meta">No recorded events yet.</p>
        )}
      </section>
    </>
  );
}

/** A row or link that opens the drawer; falls back to navigation outside the provider. */
function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function RecordLink({
  type,
  id,
  href,
  className,
  style,
  title,
  children,
}: {
  type: RecordType;
  id: string;
  href: string;
  className?: string;
  style?: CSSProperties;
  title?: string;
  children: ReactNode;
}) {
  const drawer = useRecordDrawer();
  return (
    <Link
      href={href}
      className={className}
      style={style}
      title={title}
      onClick={(event) => {
        if (!drawer || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        drawer.open({ type, id });
      }}
    >
      {children}
    </Link>
  );
}
