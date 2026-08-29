"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const STORAGE_KEY = "orvius-cookie-consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== "accepted") {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="cookie-consent fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-chalk/95 px-6 py-4 backdrop-blur-md md:px-8"
      role="dialog"
      aria-label="Cookie notice"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl font-sans text-sm leading-relaxed text-ash">
          We use essential cookies to run orvius.im and optional analytics as
          described in our{" "}
          <Link href="/cookies" className="editorial-link">
            Cookie Policy
          </Link>
          . By continuing, you agree to our{" "}
          <Link href="/terms" className="editorial-link">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="editorial-link">
            Privacy Policy
          </Link>
          .
        </p>
        <button type="button" onClick={accept} className="editorial-cta shrink-0">
          Accept
        </button>
      </div>
    </div>
  );
}
