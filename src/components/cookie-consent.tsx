"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "orvius-cookie-consent";
const DEFER_MS = 14000;

export function CookieConsent() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const onOperate = pathname?.startsWith("/dashboard") ?? false;

  useEffect(() => {
    if (onOperate) return;
    if (localStorage.getItem(STORAGE_KEY) === "accepted") return;

    const timer = setTimeout(() => {
      setVisible(true);
    }, DEFER_MS);

    return () => clearTimeout(timer);
  }, [onOperate]);

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted");
    setVisible(false);
  }

  if (onOperate || !visible) return null;

  return (
    <div className="cookie-bar" role="dialog" aria-label="Cookie notice">
      <p className="cookie-bar-text font-sans">
        Essential cookies only.{" "}
        <Link href="/cookies">Policy</Link>
      </p>
      <button type="button" onClick={accept} className="cookie-bar-accept font-sans">
        OK
      </button>
    </div>
  );
}
