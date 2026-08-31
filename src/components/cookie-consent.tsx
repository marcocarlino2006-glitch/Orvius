"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "orvius-cookie-consent";
const DEFER_MS = 10000;

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "accepted") return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, DEFER_MS);

    return () => clearTimeout(timer);
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="cookie-consent cookie-consent-minimal fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-rule bg-chalk/95 p-4 shadow-lift backdrop-blur-md"
      role="dialog"
      aria-label="Cookie notice"
    >
      <p className="font-sans text-xs leading-relaxed text-ash">
        Essential cookies only.{" "}
        <Link href="/cookies" className="editorial-link">
          Policy
        </Link>
        {" · "}
        <Link href="/privacy" className="editorial-link">
          Privacy
        </Link>
      </p>
      <button
        type="button"
        onClick={accept}
        className="cookie-consent-accept mt-3 font-sans text-xs font-medium"
      >
        Accept
      </button>
    </div>
  );
}
