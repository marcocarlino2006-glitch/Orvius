"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { OrviusLogo } from "@/components/orvius-logo";

const NAV = [
  { href: "/#workflow", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/pilot", label: "Call audit" },
  { href: "/security", label: "Security" },
] as const;

/**
 * Homepage / premium marketing header.
 * Depth on scroll, circle lockup locked, mobile drawer — multi-billion chrome.
 */
export function PremiumNav() {
  const menuId = useId();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      <header
        className={`mkt-nav ${scrolled ? "mkt-nav--elevated" : ""} ${menuOpen ? "mkt-nav--open" : ""}`}
      >
        <div className="mkt-nav-rail" aria-hidden />
        <div className="mkt-nav-inner">
          <Link
            href="/"
            className="mkt-nav-brand"
            onClick={() => setMenuOpen(false)}
          >
            <OrviusLogo variant={scrolled ? "chalk" : "void"} size="lg" />
          </Link>

          <nav className="mkt-nav-links" aria-label="Main">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mkt-nav-actions">
            <Link href="/login" className="mkt-nav-login">
              Log in
            </Link>
            <Link href="/demo" className="mkt-nav-secondary">
              Live demo
            </Link>
            <Link
              href="/pilot"
              className="mkt-btn mkt-btn-copper mkt-nav-cta"
            >
              Try Orvius
            </Link>
            <button
              type="button"
              className="mkt-nav-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span
                className={`mkt-nav-menu-icon ${menuOpen ? "mkt-nav-menu-icon--open" : ""}`}
                aria-hidden
              >
                <span />
                <span />
              </span>
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div id={menuId} className="mkt-nav-drawer">
            <nav aria-label="Mobile">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <Link href="/login" onClick={() => setMenuOpen(false)}>
                Log in
              </Link>
              <Link
                href="/pilot"
                className="mkt-btn mkt-btn-ink mkt-nav-drawer-cta"
                onClick={() => setMenuOpen(false)}
              >
                Try Orvius
              </Link>
            </nav>
          </div>
        ) : null}
      </header>

      {menuOpen ? (
        <button
          type="button"
          className="mkt-nav-backdrop"
          aria-label="Close menu"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </>
  );
}
