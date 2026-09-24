"use client";

import { useEffect } from "react";

/**
 * Adds `is-in` to every `[data-reveal]` element as it enters the viewport.
 * Hidden-until-revealed styles only apply under `html.hx-motion`, so content
 * stays visible without JS or with reduced motion.
 */
export function HomeReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll("[data-reveal]"));
    const pending = targets.filter((el) => {
      const onScreen = el.getBoundingClientRect().top < window.innerHeight;
      if (onScreen) el.classList.add("is-in");
      return !onScreen;
    });
    root.classList.add("hx-motion");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    pending.forEach((el) => io.observe(el));

    return () => {
      io.disconnect();
      root.classList.remove("hx-motion");
    };
  }, []);

  return null;
}
