"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "orvius-cookie-consent";
const DEFER_MS = 12000;

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
    <div className="cookie-bar" role="dialog" aria-label="Cookie notice">
      <p className="cookie-bar-text font-sans">
        Essential cookies only.{" "}
        <Link href="/cookies">Policy</Link>
        {" · "}
        <Link href="/privacy">Privacy</Link>
      </p>
      <button type="button" onClick={accept} className="cookie-bar-accept font-sans">
        Accept
      </button>
    </div>
  );
}
