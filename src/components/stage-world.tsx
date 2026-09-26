"use client";

import { useEffect, useRef } from "react";

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Cursor-style soft landscape plate behind the product console.
 * The poster paints first; the video loop is fetched after the page has loaded
 * so its ~400KB never competes with the hero, and never on data saver, slow
 * networks, or reduced motion.
 */
export function StageWorld() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const network = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    if (network?.saveData || /(^|-)2g$|^3g$/.test(network?.effectiveType ?? "")) return;

    const apply = () => {
      if (motion.matches) {
        video.pause();
        return;
      }
      if (!video.src) video.src = "/marketing/stage-world.mp4";
      void video.play().catch(() => {
        /* autoplay can be blocked; poster still shows */
      });
    };
    const start = () => {
      apply();
      motion.addEventListener("change", apply);
    };
    let idle: number | undefined;
    const onLoad = () => {
      idle = window.setTimeout(start, 300);
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      if (idle) window.clearTimeout(idle);
      motion.removeEventListener("change", apply);
    };
  }, []);

  return (
    <div className="ov-stage-world" aria-hidden>
      <video
        ref={videoRef}
        className="ov-stage-world-video"
        muted
        loop
        playsInline
        preload="none"
        poster="/marketing/stage-world.svg"
      />
      <span className="ov-stage-world-haze" />
      <span className="ov-stage-world-land" />
    </div>
  );
}
