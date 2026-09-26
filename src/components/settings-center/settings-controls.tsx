"use client";

import { useEffect, useRef, useState } from "react";

export function CopyLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this calendar link", value);
    }
  }
  return (
    <button type="button" className="sc-btn" onClick={() => void copy()}>
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}

export function VoiceSampleButton({ voiceId }: { voiceId: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [voiceId]);

  useEffect(() => () => audioRef.current?.pause(), []);

  function toggle() {
    if (playing) {
      audioRef.current?.pause();
      setPlaying(false);
      return;
    }
    const audio = new Audio(`/voices/${voiceId}.mp3`);
    audioRef.current?.pause();
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    setPlaying(true);
    void audio.play().catch(() => setPlaying(false));
  }

  return (
    <button type="button" className="sc-btn sc-voice-play" onClick={toggle} aria-pressed={playing}>
      {playing ? "Stop" : "Play"}
    </button>
  );
}
