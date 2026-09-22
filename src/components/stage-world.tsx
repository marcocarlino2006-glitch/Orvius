"use client";

import { useEffect, useRef } from "react";

/**
 * Cursor-style soft landscape plate behind the product console.
 * Ken-burns video loop so ambient motion is unmistakable (not GPU-transform-only).
 */
export function StageWorld() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      if (query.matches) {
        video.pause();
        video.currentTime = 0;
      } else {
        void video.play().catch(() => {
          /* autoplay can be blocked; poster still shows */
        });
      }
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  return (
    <div className="ov-stage-world" aria-hidden>
      <video
        ref={videoRef}
        className="ov-stage-world-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/marketing/stage-world.svg"
      >
        <source src="/marketing/stage-world.mp4" type="video/mp4" />
      </video>
      <span className="ov-stage-world-haze" />
      <span className="ov-stage-world-land" />
    </div>
  );
}
