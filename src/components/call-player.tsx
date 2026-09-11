"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CallPlayerProps = {
  src: string;
  /** What the call record claims, used until the file reports its own length. */
  durationSec?: number | null;
};

const SPEEDS = [1, 1.5, 2] as const;
const BUCKETS = 180;

function clock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  return `${mins}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * The recording, in place.
 *
 * What this replaces was a link reading "Play recording" that opened the raw
 * file in a new tab — so hearing thirty seconds of a call meant leaving the
 * record, landing on a bare browser audio element against a white background,
 * and coming back. Owners do this at 6am going through the night's calls; the
 * one thing they want is to skim the audio without losing their place.
 *
 * The waveform is decoded from the actual file rather than drawn from the
 * transcript. That matters: a shape derived from line lengths looks like a
 * waveform and tells you nothing, and the reason to have one at all is to see
 * where the talking is so you can skip the hold music and the goodbyes. When the
 * file will not decode — wrong codec, a bucket that sends no CORS headers — the
 * bars are dropped and the same control renders as a plain scrub track. Better a
 * player with no picture than a picture of nothing.
 */
export function CallPlayer({ src, durationSec }: CallPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(durationSec ?? 0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    /*
      RMS per bucket, not peak. Peak is dominated by the loudest transient in
      each slice, which on a phone call means line noise, and the result is a
      flat wall. RMS follows the energy, so speech reads as speech and the gaps
      between turns stay visible.
    */
    fetch(src)
      .then((res) => res.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((audio) => {
        if (cancelled) return;
        const samples = audio.getChannelData(0);
        const width = Math.max(1, Math.floor(samples.length / BUCKETS));
        const rms: number[] = [];
        for (let bucket = 0; bucket < BUCKETS; bucket++) {
          let sum = 0;
          const start = bucket * width;
          for (let i = 0; i < width; i++) {
            const value = samples[start + i] ?? 0;
            sum += value * value;
          }
          rms.push(Math.sqrt(sum / width));
        }
        const loudest = Math.max(...rms);
        setPeaks(
          loudest > 0 ? rms.map((value) => value / loudest) : rms.map(() => 0),
        );
        setLength((current) => audio.duration || current);
      })
      .catch(() => {
        if (!cancelled) setPeaks(null);
      })
      .finally(() => {
        void ctx.close().catch(() => undefined);
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  }, []);

  const seek = useCallback((to: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = to;
    setAt(to);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  if (failed) {
    return (
      <div className="call-player call-player-failed">
        <p className="call-player-note font-sans">
          This recording would not play in the browser.{" "}
          <a href={src} target="_blank" rel="noreferrer">
            Open the file directly
          </a>
          .
        </p>
      </div>
    );
  }

  const total = length || durationSec || 0;
  const progress = total > 0 ? at / total : 0;

  return (
    <div className="call-player">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const found = event.currentTarget.duration;
          if (Number.isFinite(found) && found > 0) setLength(found);
        }}
        onTimeUpdate={(event) => setAt(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
        onError={() => setFailed(true)}
      />

      <button
        type="button"
        className="call-player-play"
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" aria-hidden>
            <rect x="4" y="3" width="3" height="10" fill="currentColor" />
            <rect x="9" y="3" width="3" height="10" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden>
            <path d="M5 3l8 5-8 5V3z" fill="currentColor" />
          </svg>
        )}
      </button>

      <div className="call-player-track">
        {peaks ? (
          <div className="call-player-wave" aria-hidden>
            {peaks.map((value, index) => (
              <span
                key={index}
                className={
                  index / peaks.length <= progress
                    ? "call-player-bar is-played"
                    : "call-player-bar"
                }
                /* Floored so silence still draws a hairline and the track reads
                   as a continuous strip rather than a broken one. */
                style={{ height: `${Math.max(6, value * 100)}%` }}
              />
            ))}
          </div>
        ) : (
          <div className="call-player-plain" aria-hidden>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {/*
          The real control is this slider, sitting transparent over the bars.
          Drawing the waveform as the control would have meant reinventing
          keyboard seeking, focus and screen-reader output badly; a range input
          arrives with all of it.
        */}
        <input
          className="call-player-scrub"
          type="range"
          min={0}
          max={Math.max(total, 0.1)}
          step={0.1}
          value={at}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label="Seek recording"
          aria-valuetext={`${clock(at)} of ${clock(total)}`}
        />
      </div>

      <p className="call-player-time font-sans">
        {clock(at)}
        <span> / {clock(total)}</span>
      </p>

      <div className="call-player-rates font-sans">
        {SPEEDS.map((rate) => (
          <button
            key={rate}
            type="button"
            className={
              rate === speed ? "call-player-rate is-on" : "call-player-rate"
            }
            onClick={() => setSpeed(rate)}
            aria-pressed={rate === speed}
          >
            {rate}×
          </button>
        ))}
      </div>
    </div>
  );
}
