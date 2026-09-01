"use client";

import { useEffect, useState } from "react";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

export function HomeStickyCall() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 480);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <div className="home-sticky-call font-sans" role="complementary" aria-label="Call live demo">
      <a href={demoLineHref()} className="home-sticky-call-link">
        <span className="live-dot live-dot-green" aria-hidden />
        <span className="home-sticky-call-label">Live line</span>
        <span className="home-sticky-call-number type-phone">{DEMO_LINE_DISPLAY}</span>
      </a>
    </div>
  );
}
