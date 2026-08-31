"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  HomeOsCall,
  HomeOsDispatch,
  HomeOsJobs,
} from "@/components/home-product-stage";
import { OrviusMark } from "@/components/orvius-logo";

type SurfaceId = "call" | "jobs" | "dispatch";

type Beat = {
  id: string;
  label: string;
  surface: SurfaceId;
  duration: number;
};

const beats: Beat[] = [
  { id: "ring", label: "Call", surface: "call", duration: 2200 },
  { id: "transcript", label: "Qualify", surface: "call", duration: 5600 },
  { id: "alert", label: "Alert", surface: "call", duration: 3400 },
  { id: "inbox", label: "Inbox", surface: "call", duration: 2800 },
  { id: "jobs", label: "Jobs", surface: "jobs", duration: 3200 },
  { id: "dispatch", label: "Dispatch", surface: "dispatch", duration: 3200 },
];

const surfaces = [
  { id: "call" as const, label: "Call", path: "orvius.im/inbox" },
  { id: "jobs" as const, label: "Jobs", path: "orvius.im/jobs" },
  { id: "dispatch" as const, label: "Dispatch", path: "orvius.im/dispatch" },
];

const transcriptLines = [
  {
    speaker: "Orvius",
    text: "Thanks for calling Summit HVAC. How can I help?",
    muted: false,
  },
  {
    speaker: "Caller",
    text: "My AC stopped cooling. Can someone come today?",
    muted: true,
  },
  {
    speaker: "Orvius",
    text: "I can help. What's the address and a callback number?",
    muted: false,
  },
  {
    speaker: "Caller",
    text: "1842 Oak Street. 512-555-0123.",
    muted: true,
  },
  {
    speaker: "Orvius",
    text: "Treating this as an emergency. I'm notifying the owner now.",
    muted: false,
  },
] as const;

const PAUSE_MS = 12000;

function AnimatedTranscript({ visibleLines }: { visibleLines: number }) {
  return (
    <div className="home-os-call cinema-call">
      <div className="home-os-panel cinema-panel">
        <div className="home-os-panel-head">
          <p className="home-os-kicker">Inbound · after hours</p>
          <p className="home-os-list-meta tabular-nums">
            {visibleLines > 0 ? "2m 14s · 4 fields" : "Connecting…"}
          </p>
        </div>
        {transcriptLines.map((line, index) => (
          <p
            key={line.text}
            className={`home-os-line cinema-line ${
              line.muted ? "home-os-line-muted" : ""
            } ${index < visibleLines ? "cinema-line-visible" : ""}`}
            style={{ transitionDelay: `${index * 60}ms` }}
          >
            <span>{line.speaker}</span> {line.text}
          </p>
        ))}
        <p
          className={`home-os-foot cinema-foot ${
            visibleLines >= transcriptLines.length ? "cinema-foot-visible" : ""
          }`}
        >
          <span className="home-os-live-dot cinema-live-dot" />
          Qualified · owner SMS sent
        </p>
      </div>
      <div
        className={`home-os-panel cinema-panel cinema-alert-panel ${
          visibleLines >= transcriptLines.length - 1 ? "cinema-alert-visible" : ""
        }`}
      >
        <p className="home-os-kicker home-os-kicker-flare">Owner alert</p>
        <p className="home-os-name font-serif">Maria Lopez</p>
        <dl className="home-os-dl">
          <div>
            <dt>Service</dt>
            <dd>AC not cooling</dd>
          </div>
          <div>
            <dt>Urgency</dt>
            <dd className="home-os-dd-flare">Emergency</dd>
          </div>
          <div>
            <dt>Address</dt>
            <dd>1842 Oak Street</dd>
          </div>
          <div>
            <dt>Phone</dt>
            <dd className="tabular-nums">+1 512 555 0123</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function CinemaSurface({
  surface,
  beatId,
  visibleLines,
}: {
  surface: SurfaceId;
  beatId: string;
  visibleLines: number;
}) {
  if (surface === "call") {
    if (beatId === "ring" || beatId === "transcript") {
      return <AnimatedTranscript visibleLines={visibleLines} />;
    }
    return <HomeOsCall dense />;
  }
  if (surface === "jobs") return <HomeOsJobs dense />;
  return <HomeOsDispatch dense />;
}

export function HomeHeroCinema() {
  const [beatIndex, setBeatIndex] = useState(0);
  const [visibleLines, setVisibleLines] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manualSurface, setManualSurface] = useState<SurfaceId | null>(null);
  const pauseUntil = useRef(0);
  const lineTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const beat = beats[beatIndex];
  const surface = manualSurface ?? beat.surface;
  const currentPath =
    surfaces.find((item) => item.id === surface)?.path ?? "orvius.im/inbox";

  const pause = useCallback(() => {
    pauseUntil.current = Date.now() + PAUSE_MS;
    setPaused(true);
  }, []);

  const goToBeat = useCallback((index: number) => {
    pause();
    setManualSurface(null);
    setBeatIndex(index);
    setVisibleLines(0);
  }, [pause]);

  const selectSurface = useCallback(
    (id: SurfaceId) => {
      pause();
      setManualSurface(id);
      const match = beats.findIndex((item) => item.surface === id);
      if (match >= 0) setBeatIndex(match);
    },
    [pause],
  );

  useEffect(() => {
    if (beat.id !== "transcript") {
      setVisibleLines(beat.id === "ring" ? 0 : transcriptLines.length);
      return;
    }

    setVisibleLines(0);
    let line = 0;
    lineTimer.current = setInterval(() => {
      line += 1;
      setVisibleLines(line);
      if (line >= transcriptLines.length && lineTimer.current) {
        clearInterval(lineTimer.current);
      }
    }, 950);

    return () => {
      if (lineTimer.current) clearInterval(lineTimer.current);
    };
  }, [beat.id, beatIndex]);

  useEffect(() => {
    if (Date.now() < pauseUntil.current) {
      const resume = setTimeout(() => setPaused(false), pauseUntil.current - Date.now());
      return () => clearTimeout(resume);
    }
    setPaused(false);
  }, [beatIndex, manualSurface]);

  useEffect(() => {
    if (paused) return;

    const timer = setTimeout(() => {
      setManualSurface(null);
      setBeatIndex((current) => (current + 1) % beats.length);
    }, beat.duration);

    return () => clearTimeout(timer);
  }, [beat.duration, beatIndex, paused]);

  const showIncoming = beat.id === "ring" && !manualSurface;
  const showSms =
    (beat.id === "alert" || beat.id === "inbox") && !manualSurface;
  const highlightInbox = beat.id === "inbox" && !manualSurface;

  return (
    <div className="cinema-stage">
      <div className="cinema-glow" aria-hidden />

      <div className="cinema-tabs" role="tablist" aria-label="Product surfaces">
        {surfaces.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={surface === item.id}
            className={`cinema-tab font-sans ${
              surface === item.id ? "cinema-tab-active" : ""
            }`}
            onClick={() => selectSurface(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="home-os home-os-hero cinema-os">
        <div className="home-os-chrome font-sans">
          <span className="home-os-chrome-dots" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <span className="home-os-url">{currentPath}</span>
          <span className="home-os-live">
            <span className="home-os-live-dot cinema-live-dot" />
            Live
          </span>
        </div>

        <div className="home-os-titlebar font-sans">
          <div className="home-os-titlebar-brand">
            <OrviusMark size={22} className="home-os-mark" />
            <span className="home-os-wordmark font-serif">Orvius</span>
            <span className="home-os-shop">Summit HVAC</span>
          </div>
          <span className="home-os-shop-meta">RING 04 · FIELD LIVE</span>
        </div>

        <div className="cinema-viewport">
          {showIncoming ? (
            <div className="cinema-incoming font-sans">
              <span className="cinema-incoming-ring" aria-hidden />
              Inbound call · after hours
            </div>
          ) : null}

          {showSms ? (
            <div className="cinema-sms font-sans">
              <div className="cinema-sms-top">
                <span>Messages</span>
                <span className="cinema-sms-time">now</span>
              </div>
              <p className="cinema-sms-from">Summit HVAC</p>
              <p className="cinema-sms-title">Emergency AC · Maria Lopez</p>
              <p className="cinema-sms-detail">1842 Oak Street · Tap to view</p>
            </div>
          ) : null}

          <div className="home-os-workspace cinema-workspace">
            <aside className="home-os-rail cinema-rail" aria-label="Shop activity">
              <div className="home-os-rail-group">
                <p className="home-os-kicker">After hours</p>
                <button
                  type="button"
                  className={`home-os-rail-item ${
                    highlightInbox || surface === "call"
                      ? "home-os-rail-item-active cinema-rail-pulse"
                      : ""
                  }`}
                >
                  <span className="home-os-rail-title">Emergency AC</span>
                  <span className="home-os-rail-meta">Maria Lopez · 9:14 PM</span>
                </button>
                <button type="button" className="home-os-rail-item">
                  <span className="home-os-rail-title">No hot water</span>
                  <span className="home-os-rail-meta">James Park · 6:41 AM</span>
                </button>
              </div>
              <div className="home-os-rail-group">
                <p className="home-os-kicker">Today</p>
                <button
                  type="button"
                  className={`home-os-rail-item ${
                    surface === "jobs" ? "home-os-rail-item-active" : ""
                  }`}
                >
                  <span className="home-os-rail-title">Annual maintenance</span>
                  <span className="home-os-rail-meta">Oakridge · 8:00 AM</span>
                </button>
              </div>
            </aside>

            <div className="home-os-workspace-main">
              <div className="home-os-body home-os-body-hero">
                <div className="home-os-main cinema-main">
                  <div
                    key={`${surface}-${beatIndex}-${manualSurface ?? "auto"}`}
                    className="cinema-surface-enter"
                  >
                    <CinemaSurface
                      surface={surface}
                      beatId={manualSurface ? "inbox" : beat.id}
                      visibleLines={visibleLines}
                    />
                  </div>
                </div>
              </div>

              <div className="home-os-composer font-sans">
                <p className="home-os-composer-label">Ask</p>
                <p className="home-os-composer-placeholder">
                  Who is free for the Oakridge emergency?
                </p>
                <Link href="/login" className="home-os-composer-btn">
                  Run
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="cinema-progress font-sans" aria-label="Product story">
          {beats.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`cinema-progress-beat ${
                index === beatIndex && !manualSurface ? "cinema-progress-beat-active" : ""
              } ${index < beatIndex && !manualSurface ? "cinema-progress-beat-done" : ""}`}
              onClick={() => goToBeat(index)}
              aria-label={item.label}
            >
              <span className="cinema-progress-fill" />
              <span className="cinema-progress-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
